// Command server is the OpenScale control-plane: the Go service that backs
// the frontend's control-plane API (system health, pipelines, jobs) by
// talking to Docker, Postgres, and Redis directly.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"

	"github.com/AZURIIEAL/openscale/control-plane/internal/api"
	"github.com/AZURIIEAL/openscale/control-plane/internal/config"
	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
	"github.com/AZURIIEAL/openscale/control-plane/internal/docker"
	"github.com/AZURIIEAL/openscale/control-plane/internal/redis"
	"github.com/AZURIIEAL/openscale/control-plane/internal/streaming"
	"github.com/AZURIIEAL/openscale/control-plane/internal/ws"
)

func main() {
	logger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}).
		With().Timestamp().Logger()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	watcher, err := docker.NewWatcher(cfg.DockerHost)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to connect to Docker daemon")
	}
	defer watcher.Close()

	pool, err := db.NewPool(ctx, cfg.PostgresDSN)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to connect to Postgres")
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		logger.Fatal().Err(err).Msg("failed to apply migrations")
	}
	database := db.New(pool)

	redisClient := redis.NewClient(cfg.RedisAddr)
	defer redisClient.Close()

	jobEvents, err := redisClient.SubscribeJobEvents(ctx)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to subscribe to job events")
	}
	hub := ws.NewHub()
	go hub.Run(jobEvents)

	wsHandler := ws.NewHandler(hub, database, cfg.FrontendOrigin)

	streamingClient := streaming.NewClient(cfg.KafkaBroker)
	streamHub := streaming.NewStreamHub()
	streamConsumer := streaming.NewConsumer(cfg.KafkaBroker, streamHub, logger)
	go streamConsumer.Run(ctx)

	router := api.NewRouter(watcher, database, redisClient, wsHandler, streamingClient, streamHub, cfg.FrontendOrigin)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info().Str("port", cfg.Port).Str("frontendOrigin", cfg.FrontendOrigin).Msg("control-plane listening")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("server failed")
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	logger.Info().Msg("shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
	cancel() // stops the job-events subscription goroutine
}
