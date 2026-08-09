import { useQuery } from '@tanstack/react-query';
import { mockSystemHealthGateway } from '../infrastructure/mockSystemHealthGateway';

/**
 * The one place a gateway implementation gets selected. When the real
 * control-plane exists, this becomes the only line that changes:
 *   const gateway = new HttpSystemHealthGateway(apiClient);
 */
const gateway = mockSystemHealthGateway;

export function useSystemHealthSummary() {
  return useQuery({
    queryKey: ['system-health', 'summary'],
    queryFn: () => gateway.fetchSummary(),
    refetchInterval: 10_000,
  });
}
