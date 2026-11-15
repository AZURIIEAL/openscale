import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { httpPipelinesGateway } from '../infrastructure/httpPipelinesGateway';
import type { PipelineInput } from './PipelinesGateway';
import { runsQueryKey } from './useJobRuns';

const gateway = httpPipelinesGateway;

export const pipelinesQueryKey = (projectSlug: string) => ['pipelines', projectSlug, 'definitions'] as const;
export const pipelineRunsQueryKey = (projectSlug: string) => ['pipelines', projectSlug, 'pipeline-runs'] as const;

export function usePipelines() {
  const { slug } = useCurrentProject();
  return useQuery({ queryKey: pipelinesQueryKey(slug), queryFn: () => gateway.list(slug), enabled: slug !== '' });
}

/** The project's latest pipeline runs; polls quickly while one is running. */
export function usePipelineRuns() {
  const { slug } = useCurrentProject();
  return useQuery({
    queryKey: pipelineRunsQueryKey(slug),
    queryFn: () => gateway.listRuns(slug),
    enabled: slug !== '',
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === 'running') ? 2_000 : 10_000),
  });
}

/** Runs and job history change together: a pipeline step is a job run. */
function useRefreshRuns() {
  const { slug } = useCurrentProject();
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: pipelineRunsQueryKey(slug) });
    queryClient.invalidateQueries({ queryKey: runsQueryKey(slug) });
    queryClient.invalidateQueries({ queryKey: ['home', slug, 'overview'] });
  };
}

export function useRunPipeline() {
  const { slug } = useCurrentProject();
  const refresh = useRefreshRuns();
  return useMutation({
    mutationFn: ({ name, params }: { name: string; params?: Record<string, unknown> }) => gateway.run(slug, name, params),
    onSettled: refresh,
  });
}

export function useCancelPipelineRun() {
  const { slug } = useCurrentProject();
  const refresh = useRefreshRuns();
  return useMutation({ mutationFn: (id: string) => gateway.cancelRun(slug, id), onSettled: refresh });
}

export function useSavePipeline() {
  const { slug } = useCurrentProject();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, isNew }: { input: PipelineInput; isNew: boolean }) =>
      isNew ? gateway.create(slug, input) : gateway.update(slug, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pipelinesQueryKey(slug) }),
  });
}

export function useDeletePipeline() {
  const { slug } = useCurrentProject();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => gateway.remove(slug, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pipelinesQueryKey(slug) }),
  });
}
