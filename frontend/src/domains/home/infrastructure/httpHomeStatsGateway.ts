import { apiGet } from '@/shared/api/httpClient';
import { projectApiPath } from '@/shared/project/rules';
import type { DailyRevenuePoint } from '@/domains/dashboards/domain/entities';

// Wire shape from control-plane's internal/api/dashboards_handler.go
// HomeStats -- field names already match, no separate domain type needed
// for a single-use, one-function adapter (same call this project already
// made for httpDashboardsGateway).
export interface ApiHomeStats {
  silverRowsProcessed: number | null;
  monthsIngested: number;
  fareModelMae: number | null;
  revenueTrend14d: DailyRevenuePoint[];
}

export function fetchHomeStats(projectSlug: string): Promise<ApiHomeStats> {
  return apiGet<ApiHomeStats>(projectApiPath(projectSlug, 'home/stats'));
}
