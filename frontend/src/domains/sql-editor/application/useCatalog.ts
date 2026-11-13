import { useQuery } from '@tanstack/react-query';
import { httpQueryGateway } from '../infrastructure/httpQueryGateway';
import { useQueryTarget } from './useQueryTarget';

const gateway = httpQueryGateway;

export function useCatalog() {
  const target = useQueryTarget();
  return useQuery({
    queryKey: ['sql-editor', target.projectSlug, 'catalog', target.legacy],
    queryFn: () => gateway.fetchCatalog(target),
    enabled: target.projectSlug !== '',
    // Postgres' schema doesn't change minute to minute; a project's
    // dataset list does when an ingest finishes, so it is also invalidated
    // by the datasets hooks.
    staleTime: target.legacy ? 10 * 60 * 1000 : 30 * 1000,
  });
}
