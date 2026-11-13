import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { runsQueryKey } from '@/domains/pipelines/application/useJobRuns';
import { httpDatasetsGateway } from '../infrastructure/httpDatasetsGateway';
import { hasPendingDataset } from '../domain/rules';
import type { CreateFromUrlInput, UploadInput } from '../domain/entities';

const gateway = httpDatasetsGateway;

export const datasetsQueryKey = (projectSlug: string) => ['datasets', projectSlug] as const;

/** The project's datasets; polls while any is still ingesting. */
export function useDatasets() {
  const { slug } = useCurrentProject();
  return useQuery({
    queryKey: datasetsQueryKey(slug),
    queryFn: () => gateway.list(slug),
    enabled: slug !== '',
    refetchInterval: (query) => (hasPendingDataset(query.state.data) ? 3_000 : 30_000),
  });
}

export function useDatasetPreview(name: string | null, limit = 20) {
  const { slug } = useCurrentProject();
  return useQuery({
    queryKey: [...datasetsQueryKey(slug), name, 'preview', limit],
    queryFn: () => gateway.preview(slug, name as string, limit),
    enabled: slug !== '' && name !== null,
    staleTime: 60_000,
  });
}

export function useDatasetProfile(name: string | null) {
  const { slug } = useCurrentProject();
  return useQuery({
    queryKey: [...datasetsQueryKey(slug), name, 'profile'],
    queryFn: () => gateway.profile(slug, name as string),
    enabled: slug !== '' && name !== null,
    staleTime: 5 * 60_000,
  });
}

function useInvalidate() {
  const { slug } = useCurrentProject();
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: datasetsQueryKey(slug) });
    queryClient.invalidateQueries({ queryKey: runsQueryKey(slug) });
    queryClient.invalidateQueries({ queryKey: ['sql-editor', slug] });
  };
}

export function useUploadDataset() {
  const { slug } = useCurrentProject();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UploadInput) => gateway.upload(slug, input),
    onSettled: invalidate,
  });
}

export function useAddDatasetFile() {
  const { slug } = useCurrentProject();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ name, input }: { name: string; input: UploadInput }) => gateway.addFile(slug, name, input),
    onSettled: invalidate,
  });
}

export function useCreateDatasetFromUrl() {
  const { slug } = useCurrentProject();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateFromUrlInput) => gateway.createFromUrl(slug, input),
    onSettled: invalidate,
  });
}

export function useDeleteDataset() {
  const { slug } = useCurrentProject();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => gateway.remove(slug, name),
    onSettled: invalidate,
  });
}
