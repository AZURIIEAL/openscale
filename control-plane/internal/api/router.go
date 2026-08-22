// Package api wires HTTP routes to their handlers. Handlers stay thin --
// they translate HTTP <-> domain calls and own no business logic themselves.
package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
	"github.com/AZURIIEAL/openscale/control-plane/internal/docker"
	"github.com/AZURIIEAL/openscale/control-plane/internal/redis"
	"github.com/AZURIIEAL/openscale/control-plane/internal/streaming"
	"github.com/AZURIIEAL/openscale/control-plane/internal/ws"
)

// NewRouter builds the full HTTP route tree for the control-plane.
func NewRouter(
	watcher *docker.Watcher,
	database *db.DB,
	redisClient *redis.Client,
	wsHandler *ws.Handler,
	streamingClient *streaming.Client,
	streamHub *streaming.StreamHub,
	frontendOrigin string,
) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{frontendOrigin},
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	healthHandler := NewHealthHandler(watcher)
	actionHandler := NewContainerActionHandler(watcher)
	statsHandler := NewStatsHandler(watcher)
	jobsHandler := NewJobsHandler(database, redisClient, watcher)
	dashboardsHandler := NewDashboardsHandler(database)
	appearanceHandler := NewAppearanceHandler(database)
	queryHandler := NewQueryHandler(database)
	streamingHandler := NewStreamingHandler(streamingClient, streamHub, frontendOrigin)
	r.Route("/api", func(r chi.Router) {
		r.Get("/system-health", healthHandler.ServeHTTP)
		r.Post("/services/{id}/start", actionHandler.Start)
		r.Post("/services/{id}/stop", actionHandler.Stop)
		r.Post("/services/{id}/restart", actionHandler.Restart)
		r.Get("/container-stats", statsHandler.ServeHTTP)

		r.Post("/jobs/{type}/run", jobsHandler.Run)
		r.Get("/jobs/runs", jobsHandler.ListRuns)
		r.Delete("/jobs/runs", jobsHandler.ClearRuns)
		r.Post("/jobs/cancel-all", jobsHandler.CancelAll)
		r.Post("/jobs/{id}/control", jobsHandler.Control)

		r.Get("/dashboards/overview", dashboardsHandler.Overview)
		r.Get("/home/stats", dashboardsHandler.HomeStats)

		r.Get("/appearance-settings", appearanceHandler.Get)
		r.Put("/appearance-settings", appearanceHandler.Update)

		r.Post("/query", queryHandler.Run)
		r.Get("/query/catalog", queryHandler.Catalog)

		r.Get("/streaming/topics", streamingHandler.Topics)
		r.Get("/streaming/ws", streamingHandler.WS)

		r.Get("/ws/jobs/{id}", wsHandler.HandleJobWS)
	})

	return r
}
