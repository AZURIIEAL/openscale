import { apiGet } from '@/shared/api/httpClient';
import type { DashboardsGateway } from '../application/DashboardsGateway';
import type { DashboardsOverview } from '../domain/entities';

// The control-plane's JSON field names already match the domain shape
// field-for-field (see internal/api/dashboards_handler.go) -- no
// wire-vs-domain renaming needed here, unlike pipelines' apiMapping.
export const httpDashboardsGateway: DashboardsGateway = {
  async fetchOverview() {
    return apiGet<DashboardsOverview>('/api/dashboards/overview');
  },
};
