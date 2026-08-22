import { useMutation } from '@tanstack/react-query';
import { httpStreamingGateway } from '../infrastructure/httpStreamingGateway';
import type { ReplayParams } from '../domain/entities';

const gateway = httpStreamingGateway;

/** Triggers the worker's `replay` job -- mirrors pipelines/application/
 * useTriggerJob.ts's shape, scoped to the Streaming domain's own params
 * type instead of pipelines' generic Record<string, string>. */
export function useStartReplay() {
  return useMutation({
    mutationFn: (params: ReplayParams) => gateway.startReplay(params),
  });
}
