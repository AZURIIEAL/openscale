import { useMutation } from '@tanstack/react-query';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { httpStreamingGateway } from '../infrastructure/httpStreamingGateway';
import type { ReplayParams } from '../domain/entities';

const gateway = httpStreamingGateway;

/** Triggers the worker's `replay` job -- mirrors pipelines/application/
 * useTriggerJob.ts's shape, scoped to the Streaming domain's own params
 * type instead of pipelines' generic Record<string, string>. */
export function useStartReplay() {
  const { slug } = useCurrentProject();
  return useMutation({
    mutationFn: (params: ReplayParams) => gateway.startReplay(slug, params),
  });
}
