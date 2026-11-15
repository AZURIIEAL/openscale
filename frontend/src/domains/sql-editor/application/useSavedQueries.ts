import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { httpSavedQueriesGateway } from '../infrastructure/httpSavedQueriesGateway';
import type { ChartSpec } from '../domain/entities';

const gateway = httpSavedQueriesGateway;

export function useSavedQueries() {
  const { slug } = useCurrentProject();
  return useQuery({
    queryKey: ['saved-queries', slug],
    queryFn: () => gateway.list(slug),
    enabled: slug !== '',
  });
}

export function useSaveQuery() {
  const { slug } = useCurrentProject();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, sql, chart }: { name: string; sql: string; chart?: ChartSpec }) => gateway.save(slug, name, sql, chart),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-queries', slug] }),
  });
}

export function useDeleteSavedQuery() {
  const { slug } = useCurrentProject();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => gateway.remove(slug, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-queries', slug] }),
  });
}
