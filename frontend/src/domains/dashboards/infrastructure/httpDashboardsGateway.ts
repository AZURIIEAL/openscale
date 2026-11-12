import { apiGet } from '@/shared/api/httpClient';
import { projectApiPath } from '@/shared/project/rules';
import type { DashboardsGateway } from '../application/DashboardsGateway';
import type { DashboardsOverview } from '../domain/entities';

// The control-plane's JSON field names already match the domain shape
// field-for-field (see internal/api/dashboards_handler.go) -- no
// wire-vs-domain renaming needed here, unlike pipelines' apiMapping.
export const httpDashboardsGateway: DashboardsGateway = {
  async fetchOverview(projectSlug) {
    return apiGet<DashboardsOverview>(projectApiPath(projectSlug, 'dashboards/overview'));
  },
};
