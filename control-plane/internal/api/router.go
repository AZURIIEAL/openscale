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
	"github.com/AZURIIEAL/openscale/control-plane/internal/lake"
	"github.com/AZURIIEAL/openscale/control-plane/internal/metrics"
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
	lakeClient *lake.Client,
	m *metrics.Metrics,
	frontendOrigin string,
) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(m.Middleware)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{frontendOrigin},
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	r.Handle("/metrics", m.Handler())

	healthHandler := NewHealthHandler(watcher)
	actionHandler := NewContainerActionHandler(watcher)
	statsHandler := NewStatsHandler(watcher)
	projectsHandler := NewProjectsHandler(database)
	jobsHandler := NewJobsHandler(database, redisClient, watcher)
	dashboardsHandler := NewDashboardsHandler(database)
	appearanceHandler := NewAppearanceHandler(database)
	queryHandler := NewQueryHandler(database)
	streamingHandler := NewStreamingHandler(streamingClient, streamHub, frontendOrigin)
	lakeHandler := NewLakeHandler(lakeClient)
	r.Route("/api", func(r chi.Router) {
		// System-wide routes: the stack itself, not any one project.
		r.Get("/system-health", healthHandler.ServeHTTP)
		r.Post("/services/{id}/start", actionHandler.Start)
		r.Post("/services/{id}/stop", actionHandler.Stop)
		r.Post("/services/{id}/restart", actionHandler.Restart)
		r.Get("/container-stats", statsHandler.ServeHTTP)

		r.Get("/appearance-settings", appearanceHandler.Get)
		r.Put("/appearance-settings", appearanceHandler.Update)

		// Not yet project-scoped: the SQL editor reads Postgres as a whole,
		// the lake browser lists fixed prefixes and streaming tails one
		// topic. They move under /projects when datasets exist (Phase 2-3).
		r.Post("/query", queryHandler.Run)
		r.Get("/query/catalog", queryHandler.Catalog)
		r.Get("/streaming/topics", streamingHandler.Topics)
		r.Get("/streaming/ws", streamingHandler.WS)
		r.Get("/catalog/lake", lakeHandler.List)

		// Run ids are globally unique, so the live-log socket stays unscoped.
		r.Get("/ws/jobs/{id}", wsHandler.HandleJobWS)

		r.Get("/projects", projectsHandler.List)
		r.Post("/projects", projectsHandler.Create)
		r.Route("/projects/{projectId}", func(r chi.Router) {
			// Resolves {projectId} (id or slug) once, 404s unknown ones, and
			// puts the project in the request context for every route below.
			r.Use(projectsHandler.Middleware)

			r.Get("/", projectsHandler.Get)
			r.Patch("/", projectsHandler.Update)
			r.Delete("/", projectsHandler.Archive)

			r.Post("/jobs/{type}/run", jobsHandler.Run)
			r.Get("/jobs/runs", jobsHandler.ListRuns)
			r.Delete("/jobs/runs", jobsHandler.ClearRuns)
			r.Post("/jobs/cancel-all", jobsHandler.CancelAll)
			r.Post("/jobs/{id}/control", jobsHandler.Control)

			r.Get("/dashboards/overview", dashboardsHandler.Overview)
			r.Get("/home/stats", dashboardsHandler.HomeStats)
		})
	})

	return r
}
