import type { ServiceHealth } from '../domain/entities';

export type ContainerAction = 'start' | 'stop' | 'restart';

/**
 * Port: the mutation half of system-health, next to SystemHealthGateway's
 * read-only half. Returns the acted-on service's fresh state so the UI can
 * update immediately instead of waiting for the next poll.
 */
export interface ServiceControlGateway {
  performAction(serviceId: string, action: ContainerAction): Promise<ServiceHealth>;
}
