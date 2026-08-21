import { useQuery } from '@tanstack/react-query';
import { httpQueryGateway } from '../infrastructure/httpQueryGateway';

const gateway = httpQueryGateway;

export function useCatalog() {
  return useQuery({
    queryKey: ['sql-editor', 'catalog'],
    queryFn: () => gateway.fetchCatalog(),
    staleTime: 10 * 60 * 1000, // schema doesn't change minute to minute
  });
}
