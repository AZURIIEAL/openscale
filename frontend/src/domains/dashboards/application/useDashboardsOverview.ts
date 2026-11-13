import { useQuery } from '@tanstack/react-query';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { httpDashboardsGateway } from '../infrastructure/httpDashboardsGateway';

const gateway = httpDashboardsGateway;

/** Gold data only changes when pipelines re-run, not continuously -- a
 * 30s refetch (vs. Pipelines' 10s live polling) is plenty. */
export function useDashboardsOverview() {
  const { slug } = useCurrentProject();
  return useQuery({
    queryKey: ['dashboards', slug, 'overview'],
    queryFn: () => gateway.fetchOverview(slug),
    enabled: slug !== '',
    refetchInterval: 30_000,
  });
}
