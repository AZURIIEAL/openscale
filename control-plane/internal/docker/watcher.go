// Package docker adapts the Docker Engine API into the health domain's
// ServiceHealth shape. This is the only package in the control-plane that
// imports the Docker SDK -- everything else depends on the plain structs in
// internal/health, never on Docker's own types.
package docker

import (
	"context"
	"fmt"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"

	"github.com/AZURIIEAL/openscale/control-plane/internal/health"
)

// WatchedService names one container this control-plane reports on, plus
// the human label shown alongside its latency (e.g. "lake@9000").
type WatchedService struct {
	ID            string
	Name          string
	ContainerName string
	Label         string
	// ConsoleURL links to the service's own web UI, if it has one. Empty
	// for services with no web UI (Kafka, Postgres, Redis).
	ConsoleURL string
}

// Watcher queries the Docker daemon for the current state of a fixed set of
// containers.
type Watcher struct {
	cli *client.Client
}

// NewWatcher connects to the Docker daemon. An empty dockerHost defers to
// the SDK's own defaults (DOCKER_HOST env var, then the platform-standard
// socket/pipe).
func NewWatcher(dockerHost string) (*Watcher, error) {
	opts := []client.Opt{client.FromEnv, client.WithAPIVersionNegotiation()}
	if dockerHost != "" {
		opts = append(opts, client.WithHost(dockerHost))
	}
	cli, err := client.NewClientWithOpts(opts...)
	if err != nil {
		return nil, fmt.Errorf("docker: connect: %w", err)
	}
	return &Watcher{cli: cli}, nil
}

// Close releases the underlying Docker client connection.
func (w *Watcher) Close() error {
	return w.cli.Close()
}

// CheckAll inspects every watched container and returns one ServiceHealth
// per entry, in the same order as the input.
func (w *Watcher) CheckAll(ctx context.Context, services []WatchedService) []health.ServiceHealth {
	out := make([]health.ServiceHealth, len(services))
	for i, svc := range services {
		out[i] = w.check(ctx, svc)
	}
	return out
}

// CheckOne inspects a single watched container -- used to return a fresh
// status right after a start/stop/restart action, instead of making the
// caller wait for the next poll cycle.
func (w *Watcher) CheckOne(ctx context.Context, svc WatchedService) health.ServiceHealth {
	return w.check(ctx, svc)
}

// Start, Stop, and Restart control a container directly. containerName is
// the Docker container name (WatchedService.ContainerName), not the
// service ID -- callers resolve that themselves so this package stays
// unaware of the watched-service list (that's api/health_handler.go's job).
func (w *Watcher) Start(ctx context.Context, containerName string) error {
	return w.cli.ContainerStart(ctx, containerName, container.StartOptions{})
}

func (w *Watcher) Stop(ctx context.Context, containerName string) error {
	return w.cli.ContainerStop(ctx, containerName, container.StopOptions{})
}

func (w *Watcher) Restart(ctx context.Context, containerName string) error {
	return w.cli.ContainerRestart(ctx, containerName, container.StopOptions{})
}

func (w *Watcher) check(ctx context.Context, svc WatchedService) health.ServiceHealth {
	start := time.Now()
	info, err := w.cli.ContainerInspect(ctx, svc.ContainerName)
	latency := time.Since(start)

	if err != nil {
		return health.ServiceHealth{
			ID:         svc.ID,
			Name:       svc.Name,
			Status:     health.StatusCrit,
			Detail:     "not reachable · " + svc.Label,
			ConsoleURL: svc.ConsoleURL,
			Running:    false,
		}
	}

	status, reason := statusAndReason(info.State)
	detail := fmt.Sprintf("%.1fms · %s", msFloat(latency), svc.Label)
	if reason != "" {
		// The daemon responded fine (that's what latency would measure),
		// but the container itself isn't -- a raw ping time next to a red
		// dot is misleading, so state the actual reason instead.
		detail = reason + " · " + svc.Label
	}

	return health.ServiceHealth{
		ID:         svc.ID,
		Name:       svc.Name,
		Status:     status,
		Detail:     detail,
		ConsoleURL: svc.ConsoleURL,
		Running:    info.State != nil && info.State.Running,
	}
}

// statusAndReason derives a Status plus a short human reason for anything
// other than the healthy-running case (reason is "" when everything's
// fine, since the latency-based detail message covers that already).
func statusAndReason(state *container.State) (health.Status, string) {
	if state == nil {
		return health.StatusCrit, "unknown state"
	}
	if state.Health != nil {
		switch state.Health.Status {
		case container.Healthy:
			return health.StatusGood, ""
		case container.Starting:
			return health.StatusWarn, "starting"
		case container.Unhealthy:
			return health.StatusCrit, "unhealthy"
		}
	}
	switch {
	case state.Running:
		return health.StatusGood, ""
	case state.Restarting:
		return health.StatusWarn, "restarting"
	case state.OOMKilled:
		return health.StatusCrit, "out of memory"
	case state.Dead:
		return health.StatusCrit, "dead"
	default:
		return health.StatusCrit, "stopped"
	}
}

func msFloat(d time.Duration) float64 {
	return float64(d.Microseconds()) / 1000.0
}
