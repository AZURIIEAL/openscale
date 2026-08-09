// Command server is the OpenScale control-plane: the Go service that backs
// the frontend's control-plane API (system health, pipelines, jobs) by
// talking to Docker, Postgres, and Redis directly.
package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"

	"github.com/AZURIIEAL/openscale/control-plane/internal/api"
	"github.com/AZURIIEAL/openscale/control-plane/internal/config"
	"github.com/AZURIIEAL/openscale/control-plane/internal/docker"
)

func main() {
	logger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}).
		With().Timestamp().Logger()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	watcher, err := docker.NewWatcher(cfg.DockerHost)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to connect to Docker daemon")
	}
	defer watcher.Close()

	router := api.NewRouter(watcher, cfg.FrontendOrigin)

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
}
