import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpServiceControlGateway } from '../infrastructure/httpServiceControlGateway';
import type { ContainerAction } from './ServiceControlGateway';
import type { SystemHealthSummary } from '../domain/entities';
import { deriveOverallStatus } from '../domain/rules';

const gateway = httpServiceControlGateway;
const QUERY_KEY = ['system-health', 'summary'];

/**
 * One mutation per calling component instance -- InfrastructureScreen
 * renders this per row, so each row's pending/error state is independent
 * (starting Kafka doesn't disable the Redis buttons).
 */
export function useServiceControl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serviceId, action }: { serviceId: string; action: ContainerAction }) =>
      gateway.performAction(serviceId, action),
    onSuccess: (updated) => {
      // Patch the cache immediately with the fresh single-service result
      // the action returned, instead of waiting for the next poll.
      queryClient.setQueryData<SystemHealthSummary>(QUERY_KEY, (current) => {
        if (!current) return current;
        const services = current.services.map((s) => (s.id === updated.id ? updated : s));
        return { services, overallStatus: deriveOverallStatus(services) };
      });
    },
    onSettled: () => {
      // Belt-and-suspenders: a stop/start can still be settling on Docker's
      // side after our immediate re-check, so re-poll shortly after too.
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
