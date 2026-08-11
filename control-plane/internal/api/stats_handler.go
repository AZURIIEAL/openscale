package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/AZURIIEAL/openscale/control-plane/internal/docker"
)

// ContainerStatsResponse is the wire shape for GET /api/container-stats --
// per-container CPU/memory usage plus host-wide totals, backing the Home
// dashboard's live resource gauges and per-image breakdown table.
type ContainerStatsResponse struct {
	Containers []containerStatDTO `json:"containers"`
	Totals     totalsDTO          `json:"totals"`
}

type containerStatDTO struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Image         string  `json:"image"`
	CPUPercent    float64 `json:"cpuPercent"`
	MemUsageBytes uint64  `json:"memUsageBytes"`
	MemLimitBytes uint64  `json:"memLimitBytes"`
	MemPercent    float64 `json:"memPercent"`
}

type totalsDTO struct {
	// CPUPercent is host-wide: 100 == every online core fully busy across
	// all containers combined (not per-core, unlike the per-container
	// figure above).
	CPUPercent    float64 `json:"cpuPercent"`
	MemUsedBytes  uint64  `json:"memUsedBytes"`
	MemTotalBytes uint64  `json:"memTotalBytes"`
	MemPercent    float64 `json:"memPercent"`
	NumCPU        int     `json:"numCpu"`
}

// StatsHandler serves GET /api/container-stats, reading a fresh snapshot
// from the Docker daemon on every request -- the frontend controls the
// real-time cadence via its poll interval.
type StatsHandler struct {
	watcher *docker.Watcher
}

func NewStatsHandler(watcher *docker.Watcher) *StatsHandler {
	return &StatsHandler{watcher: watcher}
}

func (h *StatsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	snapshot, err := h.watcher.Stats(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	resp := ContainerStatsResponse{Containers: make([]containerStatDTO, 0, len(snapshot.Containers))}

	var cpuPercentSum float64
	var memUsedSum uint64
	for _, c := range snapshot.Containers {
		resp.Containers = append(resp.Containers, containerStatDTO{
			ID:            c.ID,
			Name:          c.Name,
			Image:         c.Image,
			CPUPercent:    c.CPUPercent,
			MemUsageBytes: c.MemUsageBytes,
			MemLimitBytes: c.MemLimitBytes,
			MemPercent:    c.MemPercent,
		})
		cpuPercentSum += c.CPUPercent
		memUsedSum += c.MemUsageBytes
	}

	numCPU := float64(snapshot.HostNumCPU)
	if numCPU == 0 {
		numCPU = 1
	}
	// Per-container CPUPercent is normalized to "100 == one core"; dividing
	// the sum by core count converts that into a single 0-100 host-wide
	// utilization figure, matching the memory gauge's scale.
	hostCPUPercent := cpuPercentSum / numCPU

	memPercent := 0.0
	if snapshot.HostMemTotalBytes > 0 {
		memPercent = float64(memUsedSum) / float64(snapshot.HostMemTotalBytes) * 100.0
	}

	resp.Totals = totalsDTO{
		CPUPercent:    hostCPUPercent,
		MemUsedBytes:  memUsedSum,
		MemTotalBytes: snapshot.HostMemTotalBytes,
		MemPercent:    memPercent,
		NumCPU:        snapshot.HostNumCPU,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
