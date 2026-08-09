import { useQuery } from '@tanstack/react-query';
import { mockHomeGateway } from '../infrastructure/mockHomeGateway';

const gateway = mockHomeGateway;

export function useHomeOverview() {
  return useQuery({
    queryKey: ['home', 'overview'],
    queryFn: () => gateway.fetchOverview(),
    refetchInterval: 15_000,
  });
}
