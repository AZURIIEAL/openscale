import { apiGet, wsUrl } from '@/shared/api/httpClient';
import { httpJobControlGateway } from '@/domains/pipelines/infrastructure/httpJobControlGateway';
import type { StreamingGateway } from '../application/StreamingGateway';
import type { ConnectionStatus, KafkaTopic, TripEvent, WindowAggregate } from '../domain/entities';

interface ApiTopicsResponse {
  topics: { name: string; partitions: number; messageCount: number }[];
  brokerReachable: boolean;
}

/** Wire shape for one trip event -- the control-plane relays it straight
 * off the yellow-taxi-trips Kafka topic, which keeps the original TLC
 * column names the worker's replay job wrote (pandas' row.to_json() over a
 * Silver row; see control-plane/internal/streaming.TripEvent's json tags
 * and worker/jobs/replay.py). Translated to the domain's camelCase
 * TripEvent below -- this is the only place that name translation happens. */
interface ApiTripEvent {
  tpep_pickup_datetime: string;
  tpep_dropoff_datetime: string;
  PULocationID: number;
  DOLocationID: number;
  passenger_count: number;
  trip_distance: number;
  fare_amount: number;
  tip_amount: number;
  total_amount: number;
  payment_type: number;
}

interface ApiWindowAggregate {
  tripCount: number;
  messagesPerSecond: number;
  totalRevenue: number;
  avgFare: number;
  avgDistance: number;
  windowEndedAt: string;
}

type ApiFrame = { type: 'trip'; trip: ApiTripEvent } | { type: 'window'; window: ApiWindowAggregate };

function mapTrip(api: ApiTripEvent): TripEvent {
  return {
    pickupAt: api.tpep_pickup_datetime,
    dropoffAt: api.tpep_dropoff_datetime,
    pickupLocationId: api.PULocationID,
    dropoffLocationId: api.DOLocationID,
    passengerCount: api.passenger_count,
    tripDistanceMiles: api.trip_distance,
    fareAmount: api.fare_amount,
    tipAmount: api.tip_amount,
    totalAmount: api.total_amount,
    paymentType: api.payment_type,
  };
}

function mapWindow(api: ApiWindowAggregate): WindowAggregate {
  return {
    tripCount: api.tripCount,
    messagesPerSecond: api.messagesPerSecond,
    totalRevenue: api.totalRevenue,
    avgFare: api.avgFare,
    avgDistanceMiles: api.avgDistance,
    windowEndedAt: api.windowEndedAt,
  };
}

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15000;

export const httpStreamingGateway: StreamingGateway = {
  async listTopics() {
    const res = await apiGet<ApiTopicsResponse>('/api/streaming/topics');
    return {
      topics: res.topics.map((t): KafkaTopic => ({ name: t.name, partitions: t.partitions, messageCount: t.messageCount })),
      brokerReachable: res.brokerReachable,
    };
  },

  // Reuses the pipelines domain's generic job-trigger gateway directly
  // (POST /api/projects/{p}/jobs/{type}/run has no pipelines-specific coupling) rather
  // than duplicating apiPost + JobRun mapping here.
  async startReplay(projectSlug, params) {
    // Typed values: the run endpoint validates them against replay's
    // params schema (limit: integer, messagesPerSecond: number).
    const body: Record<string, unknown> = {
      limit: params.limit,
      messagesPerSecond: params.messagesPerSecond,
    };
    if (params.date) body.date = params.date;
    return httpJobControlGateway.triggerRun(projectSlug, 'replay', body);
  },

  connect(onFrame, onStatusChange) {
    return openLiveSocket(
      '/api/streaming/ws',
      (data: ApiFrame) => {
        if (data.type === 'trip') onFrame({ type: 'trip', trip: mapTrip(data.trip) });
        else if (data.type === 'window') onFrame({ type: 'window', window: mapWindow(data.window) });
      },
      onStatusChange,
    );
  },
};

/**
 * Opens a WebSocket on path and keeps it open: the user may load a screen
 * before Kafka or any stream has run, or the control-plane may restart, so
 * it always retries with capped exponential backoff. Each message is parsed
 * as JSON (a malformed one is skipped). Returns a cleanup function that
 * closes the socket and cancels any pending reconnect.
 */
export function openLiveSocket<T>(path: string, onData: (data: T) => void, onStatusChange?: (status: ConnectionStatus) => void): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function open() {
    if (closed) return;
    onStatusChange?.('connecting');
    socket = new WebSocket(wsUrl(path));
    socket.onopen = () => {
      attempt = 0;
      onStatusChange?.('live');
    };
    socket.onmessage = (event) => {
      let data: T;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      onData(data);
    };
    socket.onclose = () => {
      if (closed) return;
      onStatusChange?.('disconnected');
      const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
      attempt += 1;
      reconnectTimer = setTimeout(open, delay);
    };
    socket.onerror = () => socket?.close();
  }

  open();
  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket?.close();
  };
}
