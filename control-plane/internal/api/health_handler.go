package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/AZURIIEAL/openscale/control-plane/internal/docker"
	"github.com/AZURIIEAL/openscale/control-plane/internal/health"
)

// watchedServices is the fixed set of containers this control-plane reports
// on and controls. Names match the container_name fields in the root
// docker-compose.yml (project "openscale").
// Console URLs point at each service's own web UI, where one exists. They
// are paths on the app's own origin -- the frontend dev server and the
// deploy gateway proxy each prefix to its service -- so the links work from
// any machine, not just this one. Kafka, Postgres, Redis, and the worker
// are protocol-only/headless in this stack, and MinIO's console holds the
// lake's root credentials, so none of them is linked; MinIO's console is
// still at localhost:9101 on the machine itself.
var watchedServices = []docker.WatchedService{
	{ID: "minio", Name: "MinIO", ContainerName: "openscale-minio", Label: "lake@9000"},
	{ID: "kafka", Name: "Kafka", ContainerName: "openscale-kafka", Label: "9092"},
	{ID: "postgres", Name: "Postgres", ContainerName: "openscale-postgres", Label: "5432"},
	{ID: "redis", Name: "Redis", ContainerName: "openscale-redis", Label: "6379"},
	{ID: "prometheus", Name: "Prometheus", ContainerName: "openscale-prometheus", Label: ":9090", ConsoleURL: "/prometheus/"},
	{ID: "grafana", Name: "Grafana", ContainerName: "openscale-grafana", Label: ":3000", ConsoleURL: "/grafana/"},
	{ID: "worker", Name: "Worker", ContainerName: "openscale-worker", Label: "job queue"},
	{ID: "jupyter", Name: "Jupyter", ContainerName: "openscale-jupyter", Label: ":8888", ConsoleURL: "/jupyter/lab?token=openscale-dev"},
	{ID: "mlflow", Name: "MLflow", ContainerName: "openscale-mlflow", Label: ":5000", ConsoleURL: "/mlflow/"},
}

// findWatchedService looks up a watched service by its API-facing ID (e.g.
// "grafana"), shared by the health and container-action handlers.
func findWatchedService(id string) (docker.WatchedService, bool) {
	for _, svc := range watchedServices {
		if svc.ID == id {
			return svc, true
		}
	}
	return docker.WatchedService{}, false
}

// HealthHandler serves GET /api/system-health, the real backing endpoint
// for the frontend's system-health domain (see
// frontend/src/domains/system-health/infrastructure/mockSystemHealthGateway.ts
// for the shape this must match).
type HealthHandler struct {
	watcher *docker.Watcher
}

func NewHealthHandler(watcher *docker.Watcher) *HealthHandler {
	return &HealthHandler{watcher: watcher}
}

func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	services := h.watcher.CheckAll(ctx, watchedServices)
	summary := health.Summary{
		Services:      services,
		OverallStatus: health.DeriveOverallStatus(services),
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(summary)
}
