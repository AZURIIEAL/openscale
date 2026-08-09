import { useQuery } from '@tanstack/react-query';
import { httpSystemHealthGateway } from '../infrastructure/httpSystemHealthGateway';

/**
 * The one place a gateway implementation gets selected. Now pointed at the
 * real control-plane; swap back to mockSystemHealthGateway here if the
 * control-plane isn't running locally.
 */
const gateway = httpSystemHealthGateway;

export function useSystemHealthSummary() {
  return useQuery({
    queryKey: ['system-health', 'summary'],
    queryFn: () => gateway.fetchSummary(),
    refetchInterval: 10_000,
  });
}
