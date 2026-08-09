package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/AZURIIEAL/openscale/control-plane/internal/docker"
)

// containerAction matches Watcher's Start/Stop/Restart signatures, letting
// the three HTTP handlers below share one code path instead of repeating
// the lookup/timeout/response boilerplate three times.
type containerAction func(ctx context.Context, containerName string) error

// ContainerActionHandler serves the start/stop/restart endpoints -- the
// control half of system-health, next to HealthHandler's read-only half.
type ContainerActionHandler struct {
	watcher *docker.Watcher
}

func NewContainerActionHandler(watcher *docker.Watcher) *ContainerActionHandler {
	return &ContainerActionHandler{watcher: watcher}
}

func (h *ContainerActionHandler) Start(w http.ResponseWriter, r *http.Request) {
	h.perform(w, r, h.watcher.Start)
}

func (h *ContainerActionHandler) Stop(w http.ResponseWriter, r *http.Request) {
	h.perform(w, r, h.watcher.Stop)
}

func (h *ContainerActionHandler) Restart(w http.ResponseWriter, r *http.Request) {
	h.perform(w, r, h.watcher.Restart)
}

func (h *ContainerActionHandler) perform(w http.ResponseWriter, r *http.Request, action containerAction) {
	svc, ok := findWatchedService(chi.URLParam(r, "id"))
	if !ok {
		http.Error(w, "unknown service", http.StatusNotFound)
		return
	}

	// Docker itself can take a few seconds to stop/start a container
	// (graceful shutdown grace period, image already local so start is
	// fast) -- 15s covers that without hanging the request indefinitely.
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	if err := action(ctx, svc.ContainerName); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	result := h.watcher.CheckOne(ctx, svc)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}
