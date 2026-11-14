import { useQuery } from '@tanstack/react-query';
import { httpJobsGateway } from '../infrastructure/httpJobsGateway';

/** Swap to mockJobsGateway here if the control-plane isn't running locally. */
const gateway = httpJobsGateway;

/** The catalog only changes when the worker restarts with different jobs,
 * so it's cached for a few minutes. It's the same for every project, so
 * the key carries no slug. */
export const jobCatalogQueryKey = ['jobs', 'catalog'] as const;

export function useJobCatalog() {
  return useQuery({
    queryKey: jobCatalogQueryKey,
    queryFn: () => gateway.fetchCatalog(),
    staleTime: 5 * 60 * 1000,
  });
}
