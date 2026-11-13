import type { DashboardsOverview } from '../domain/entities';

/**
 * Port: the read half of the dashboards domain -- one composed overview
 * covering every chart tile. infrastructure/ provides the http implementation.
 */
export interface DashboardsGateway {
  fetchOverview(projectSlug: string): Promise<DashboardsOverview>;
}
