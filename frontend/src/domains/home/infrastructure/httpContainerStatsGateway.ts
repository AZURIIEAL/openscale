import { apiGet } from '@/shared/api/httpClient';
import type { ContainerStatsGateway } from '../application/ContainerStatsGateway';
import type { ContainerStatsSnapshot } from '../domain/entities';

/**
 * Real adapter: calls the Go control-plane's GET /api/container-stats,
 * which reads a fresh one-shot Docker stats sample for every running
 * container on the host (see control-plane/internal/docker/stats.go and
 * control-plane/internal/api/stats_handler.go).
 */
export const httpContainerStatsGateway: ContainerStatsGateway = {
  fetchStats() {
    return apiGet<ContainerStatsSnapshot>('/api/container-stats');
  },
};
