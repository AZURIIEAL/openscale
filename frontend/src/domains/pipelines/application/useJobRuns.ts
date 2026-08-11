import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpJobsGateway } from '../infrastructure/httpJobsGateway';

/**
 * The one place a gateway implementation gets selected. Swap to
 * mockJobsGateway here if the control-plane isn't running locally.
 */
const gateway = httpJobsGateway;

export const RUNS_PAGE_SIZE = 10;

export function useJobRunsPage(page: number) {
  return useQuery({
    queryKey: ['pipelines', 'runs', page],
    queryFn: () => gateway.fetchRuns({ limit: RUNS_PAGE_SIZE, offset: page * RUNS_PAGE_SIZE }),
    refetchInterval: 10_000,
  });
}

export function useClearRuns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gateway.clearRuns(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines', 'runs'] });
      queryClient.invalidateQueries({ queryKey: ['home', 'overview'] });
    },
  });
}
