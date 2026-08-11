import type { ContainerStatsSnapshot } from '../domain/entities';

/** Port -- see system-health/application/SystemHealthGateway.ts for the
 * same pattern explained in full. */
export interface ContainerStatsGateway {
  fetchStats(): Promise<ContainerStatsSnapshot>;
}
