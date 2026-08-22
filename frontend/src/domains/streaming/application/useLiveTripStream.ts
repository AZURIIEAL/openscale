import { useEffect, useState } from 'react';
import { httpStreamingGateway } from '../infrastructure/httpStreamingGateway';
import type { ConnectionStatus, StreamFrame, TripEvent, WindowAggregate } from '../domain/entities';

const gateway = httpStreamingGateway;

const MAX_TRIPS = 20;
const MAX_WINDOW_HISTORY = 30;

/**
 * Live trip feed for the Streaming screen -- wraps StreamingGateway.connect,
 * holding connection status, the last ~20 trip events (most-recent-first),
 * the latest window aggregate, and a short history of recent windows for
 * the live sparkline. Cleans up the WebSocket on unmount.
 */
export function useLiveTripStream() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [trips, setTrips] = useState<TripEvent[]>([]);
  const [latestWindow, setLatestWindow] = useState<WindowAggregate | null>(null);
  const [windowHistory, setWindowHistory] = useState<WindowAggregate[]>([]);

  useEffect(() => {
    const disconnect = gateway.connect((frame: StreamFrame) => {
      if (frame.type === 'trip') {
        setTrips((current) => [frame.trip, ...current].slice(0, MAX_TRIPS));
      } else {
        setLatestWindow(frame.window);
        setWindowHistory((current) => [...current, frame.window].slice(-MAX_WINDOW_HISTORY));
      }
    }, setStatus);

    return disconnect;
  }, []);

  return { status, trips, latestWindow, windowHistory };
}
