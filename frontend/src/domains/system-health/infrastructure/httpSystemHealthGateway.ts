import { apiGet } from '@/shared/api/httpClient';
import type { SystemHealthGateway } from '../application/SystemHealthGateway';
import type { SystemHealthSummary } from '../domain/entities';

/**
 * Real adapter: calls the Go control-plane's GET /api/system-health, which
 * inspects the actual Docker containers (see control-plane/internal/docker
 * and control-plane/internal/api/health_handler.go). Same port as
 * mockSystemHealthGateway, so swapping which one is used is a one-line
 * change in useSystemHealthSummary.ts.
 */
export const httpSystemHealthGateway: SystemHealthGateway = {
  fetchSummary() {
    return apiGet<SystemHealthSummary>('/api/system-health');
  },
};
