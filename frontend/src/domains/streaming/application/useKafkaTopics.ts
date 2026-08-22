import { useQuery } from '@tanstack/react-query';
import { httpStreamingGateway } from '../infrastructure/httpStreamingGateway';

/** The one place a gateway implementation gets selected. Swap to
 * mockStreamingGateway here if the control-plane isn't running locally. */
const gateway = httpStreamingGateway;

/** Polling, not the live WebSocket -- this is an admin snapshot (topic
 * names/partition counts/message counts), not the per-trip live feed, so a
 * 5s refetch is plenty fresh without adding a second live channel. */
export function useKafkaTopics() {
  return useQuery({
    queryKey: ['streaming', 'topics'],
    queryFn: () => gateway.listTopics(),
    refetchInterval: 5000,
  });
}
