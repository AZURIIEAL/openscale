import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { httpJobsGateway } from '../infrastructure/httpJobsGateway';

/**
 * The one place a gateway implementation gets selected. Swap to
 * mockJobsGateway here if the control-plane isn't running locally.
 */
const gateway = httpJobsGateway;

export const RUNS_PAGE_SIZE = 10;

/** Cache key for one project's run pages. The slug sits second so a
 * project switch never serves another project's cached runs, and so an
 * invalidation of ['pipelines', slug, 'runs'] hits every page. */
export const runsQueryKey = (projectSlug: string) => ['pipelines', projectSlug, 'runs'] as const;

export function useJobRunsPage(page: number) {
  const { slug } = useCurrentProject();
  return useQuery({
    queryKey: [...runsQueryKey(slug), page],
    queryFn: () => gateway.fetchRuns(slug, { limit: RUNS_PAGE_SIZE, offset: page * RUNS_PAGE_SIZE }),
    enabled: slug !== '',
    refetchInterval: 10_000,
  });
}

export function useClearRuns() {
  const { slug } = useCurrentProject();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gateway.clearRuns(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runsQueryKey(slug) });
      queryClient.invalidateQueries({ queryKey: ['home', slug, 'overview'] });
    },
  });
}

export function useCancelAllRuns() {
  const { slug } = useCurrentProject();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gateway.cancelAllRuns(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runsQueryKey(slug) });
      queryClient.invalidateQueries({ queryKey: ['home', slug, 'overview'] });
    },
  });
}
