import { useQuery } from '@tanstack/react-query';
import { httpLakeGateway } from '../infrastructure/httpLakeGateway';

/** The one place a gateway implementation gets selected. Swap to
 * mockLakeGateway here if the control-plane isn't running locally. */
const gateway = httpLakeGateway;

export function useLakeCatalog() {
  return useQuery({
    queryKey: ['data-catalog', 'lake'],
    queryFn: () => gateway.fetchLakeCatalog(),
    staleTime: 10 * 60 * 1000, // the lake's known prefixes don't change minute to minute, same as sql-editor's useCatalog
  });
}
