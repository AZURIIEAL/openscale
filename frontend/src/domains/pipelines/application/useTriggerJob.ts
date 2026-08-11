import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpJobControlGateway } from '../infrastructure/httpJobControlGateway';
import type { JobRun } from '../domain/entities';

const gateway = httpJobControlGateway;
const QUERY_KEY = ['pipelines', 'runs'];

export function useTriggerJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobType, params }: { jobType: string; params: Record<string, string> }) =>
      gateway.triggerRun(jobType, params),
    onSuccess: (run) => {
      // Prepend immediately instead of waiting for the next poll.
      queryClient.setQueryData<JobRun[]>(QUERY_KEY, (current) => (current ? [run, ...current] : [run]));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
