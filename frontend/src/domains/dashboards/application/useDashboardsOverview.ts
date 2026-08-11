import { useQuery } from '@tanstack/react-query';
import { httpDashboardsGateway } from '../infrastructure/httpDashboardsGateway';

const gateway = httpDashboardsGateway;

/** Gold data only changes when pipelines re-run, not continuously -- a
 * 30s refetch (vs. Pipelines' 10s live polling) is plenty. */
export function useDashboardsOverview() {
  return useQuery({
    queryKey: ['dashboards', 'overview'],
    queryFn: () => gateway.fetchOverview(),
    refetchInterval: 30_000,
  });
}
