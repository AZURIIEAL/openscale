import type { HomeOverview } from '../domain/entities';

/** Port -- see system-health/application/SystemHealthGateway.ts for the
 * same pattern explained in full. */
export interface HomeGateway {
  fetchOverview(): Promise<HomeOverview>;
}
