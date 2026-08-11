import { useQuery } from '@tanstack/react-query';
import { httpJobsGateway } from '../infrastructure/httpJobsGateway';

/**
 * The one place a gateway implementation gets selected. Swap to
 * mockJobsGateway here if the control-plane isn't running locally.
 */
const gateway = httpJobsGateway;

export function useJobRuns() {
  return useQuery({
    queryKey: ['pipelines', 'runs'],
    queryFn: () => gateway.fetchRuns(),
    refetchInterval: 10_000,
  });
}
