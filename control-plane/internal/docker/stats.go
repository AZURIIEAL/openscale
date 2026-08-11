package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/docker/docker/api/types/container"
)

// ContainerStat is one running container's current resource usage, read
// fresh from the Docker daemon (not cached).
type ContainerStat struct {
	ID            string
	Name          string
	Image         string
	CPUPercent    float64
	MemUsageBytes uint64
	MemLimitBytes uint64
	MemPercent    float64
}

// ResourceSnapshot is every running container's resource usage plus the
// host facts (total memory, CPU count) needed to turn per-container
// figures into host-wide totals.
type ResourceSnapshot struct {
	Containers        []ContainerStat
	HostMemTotalBytes uint64
	HostNumCPU        int
}

// Stats lists every running container on the Docker host -- deliberately
// not just watchedServices, so the Home dashboard's "full container"
// gauges reflect everything Docker is running, not only the services this
// control-plane itself manages -- and reads a one-shot resource snapshot
// for each.
func (w *Watcher) Stats(ctx context.Context) (ResourceSnapshot, error) {
	summaries, err := w.cli.ContainerList(ctx, container.ListOptions{})
	if err != nil {
		return ResourceSnapshot{}, fmt.Errorf("docker: list containers: %w", err)
	}

	info, err := w.cli.Info(ctx)
	if err != nil {
		return ResourceSnapshot{}, fmt.Errorf("docker: info: %w", err)
	}

	out := make([]ContainerStat, 0, len(summaries))
	for _, summary := range summaries {
		stat, err := w.oneShotStat(ctx, summary)
		if err != nil {
			// Container may have stopped between the list call and the
			// stat read, or stats may be unsupported for it -- skip it
			// rather than failing the whole snapshot.
			continue
		}
		out = append(out, stat)
	}

	return ResourceSnapshot{
		Containers:        out,
		HostMemTotalBytes: uint64(info.MemTotal),
		HostNumCPU:        info.NCPU,
	}, nil
}

func (w *Watcher) oneShotStat(ctx context.Context, summary container.Summary) (ContainerStat, error) {
	reader, err := w.cli.ContainerStatsOneShot(ctx, summary.ID)
	if err != nil {
		return ContainerStat{}, err
	}
	defer reader.Body.Close()

	var raw container.StatsResponse
	if err := json.NewDecoder(reader.Body).Decode(&raw); err != nil {
		return ContainerStat{}, err
	}

	name := summary.ID
	if len(summary.Names) > 0 {
		name = summary.Names[0]
	}
	name = strings.TrimPrefix(name, "/")

	usage := memUsage(raw.MemoryStats)
	return ContainerStat{
		ID:            summary.ID[:12],
		Name:          name,
		Image:         summary.Image,
		CPUPercent:    cpuPercent(raw),
		MemUsageBytes: usage,
		MemLimitBytes: raw.MemoryStats.Limit,
		MemPercent:    memPercentOf(usage, raw.MemoryStats.Limit),
	}, nil
}

// cpuPercent replicates the calculation the `docker stats` CLI itself
// uses: CPU time consumed by the container since the daemon's last cached
// sample, as a percentage of one full core (so a container pegging 2
// cores reports ~200%).
func cpuPercent(s container.StatsResponse) float64 {
	cpuDelta := float64(s.CPUStats.CPUUsage.TotalUsage) - float64(s.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(s.CPUStats.SystemUsage) - float64(s.PreCPUStats.SystemUsage)
	if systemDelta <= 0 || cpuDelta < 0 {
		return 0
	}

	onlineCPUs := float64(s.CPUStats.OnlineCPUs)
	if onlineCPUs == 0 {
		onlineCPUs = float64(len(s.CPUStats.CPUUsage.PercpuUsage))
	}
	if onlineCPUs == 0 {
		onlineCPUs = 1
	}

	return (cpuDelta / systemDelta) * onlineCPUs * 100.0
}

// memUsage excludes page cache from the raw usage figure -- cgroup v1
// reports it under "cache", cgroup v2 under "inactive_file" -- matching
// what `docker stats` displays, since raw usage otherwise looks inflated
// by cache Linux would gladly evict under memory pressure.
func memUsage(m container.MemoryStats) uint64 {
	if v, ok := m.Stats["inactive_file"]; ok && v < m.Usage {
		return m.Usage - v
	}
	if v, ok := m.Stats["cache"]; ok && v < m.Usage {
		return m.Usage - v
	}
	return m.Usage
}

func memPercentOf(usage, limit uint64) float64 {
	if limit == 0 {
		return 0
	}
	return float64(usage) / float64(limit) * 100.0
}
