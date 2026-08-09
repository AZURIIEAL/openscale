// Package api wires HTTP routes to their handlers. Handlers stay thin --
// they translate HTTP <-> domain calls and own no business logic themselves.
package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/AZURIIEAL/openscale/control-plane/internal/docker"
)

// NewRouter builds the full HTTP route tree for the control-plane.
func NewRouter(watcher *docker.Watcher, frontendOrigin string) http.Handler {
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
	r.Route("/api", func(r chi.Router) {
		r.Get("/system-health", healthHandler.ServeHTTP)
		r.Post("/services/{id}/start", actionHandler.Start)
		r.Post("/services/{id}/stop", actionHandler.Stop)
		r.Post("/services/{id}/restart", actionHandler.Restart)
	})

	return r
}
