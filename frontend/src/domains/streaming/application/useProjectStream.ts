import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/httpClient';
import { projectApiPath } from '@/shared/project/rules';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { openLiveSocket } from '../infrastructure/httpStreamingGateway';
import type { ConnectionStatus, KafkaTopic, TailFrame } from '../domain/entities';

const MAX_MESSAGES = 20;
const MAX_WINDOWS = 30;

/** The project's own Kafka topics (`{slug}.*`), polled like the legacy panel. */
export function useProjectTopics() {
  const { slug } = useCurrentProject();
  return useQuery({
    queryKey: ['streaming', slug, 'topics'],
    queryFn: () => apiGet<{ topics: KafkaTopic[]; brokerReachable: boolean }>(projectApiPath(slug, 'streaming/topics')),
    enabled: slug !== '',
    refetchInterval: 5000,
  });
}

export interface RateWindow {
  at: string;
  messagesPerSecond: number;
}

/** A live tail of one project topic, from the moment it opens: the newest
 * messages first, and the rate per ~2s window. Reopens when topic changes. */
export function useTopicTail(topic: string | undefined) {
  const { slug } = useCurrentProject();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [messages, setMessages] = useState<{ offset: number; value: unknown }[]>([]);
  const [windows, setWindows] = useState<RateWindow[]>([]);

  useEffect(() => {
    setMessages([]);
    setWindows([]);
    if (!topic || !slug) return;
    const path = `${projectApiPath(slug, 'streaming/ws')}?topic=${encodeURIComponent(topic)}`;
    return openLiveSocket<TailFrame>(
      path,
      (frame) => {
        if (frame.type === 'message') setMessages((m) => [{ offset: frame.offset, value: frame.value }, ...m].slice(0, MAX_MESSAGES));
        else setWindows((w) => [...w, { at: new Date().toISOString(), messagesPerSecond: frame.messagesPerSecond }].slice(-MAX_WINDOWS));
      },
      setStatus,
    );
  }, [slug, topic]);

  return { status, messages, windows };
}
