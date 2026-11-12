import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { httpJobControlGateway } from '../infrastructure/httpJobControlGateway';
import { runsQueryKey } from './useJobRuns';

const gateway = httpJobControlGateway;

export function useTriggerJob() {
  const { slug } = useCurrentProject();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobType, params }: { jobType: string; params: Record<string, string> }) =>
      gateway.triggerRun(slug, jobType, params),
    onSettled: () => {
      // The runs table polls every 10s; invalidating makes the new queued
      // row show up on the next tick rather than guessing at the page shape.
      queryClient.invalidateQueries({ queryKey: runsQueryKey(slug) });
      queryClient.invalidateQueries({ queryKey: ['home', slug, 'overview'] });
    },
  });
}
