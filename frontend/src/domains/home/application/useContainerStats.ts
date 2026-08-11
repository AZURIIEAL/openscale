import { useQuery } from '@tanstack/react-query';
import { httpContainerStatsGateway } from '../infrastructure/httpContainerStatsGateway';

const gateway = httpContainerStatsGateway;

/**
 * Polls the control-plane's live Docker stats every 4s -- fast enough to
 * read as real-time on the Home dashboard without hammering the daemon
 * (each poll does one ContainerStatsOneShot call per running container).
 */
export function useContainerStats() {
  return useQuery({
    queryKey: ['home', 'container-stats'],
    queryFn: () => gateway.fetchStats(),
    refetchInterval: 4_000,
  });
}
