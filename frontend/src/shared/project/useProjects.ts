import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpProjectsGateway } from './httpProjectsGateway';
import type { CreateProjectInput } from './entities';

const gateway = httpProjectsGateway;

export const PROJECTS_QUERY_KEY = ['projects'] as const;

export function useProjectsList() {
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => gateway.list(),
    staleTime: 60_000,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => gateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY }),
  });
}

export function useArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => gateway.archive(slug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY }),
  });
}
