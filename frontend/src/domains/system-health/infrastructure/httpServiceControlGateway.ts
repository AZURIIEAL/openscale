import { apiPost } from '@/shared/api/httpClient';
import type { ServiceControlGateway } from '../application/ServiceControlGateway';
import type { ServiceHealth } from '../domain/entities';

/**
 * Real adapter: calls the Go control-plane's
 * POST /api/services/{id}/{start|stop|restart} (see
 * control-plane/internal/api/container_actions_handler.go), which acts on
 * the real Docker container and returns its fresh status.
 */
export const httpServiceControlGateway: ServiceControlGateway = {
  performAction(serviceId, action) {
    return apiPost<ServiceHealth>(`/api/services/${serviceId}/${action}`);
  },
};
