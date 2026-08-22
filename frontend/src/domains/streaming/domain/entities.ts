/** One Kafka topic's shape, for the admin snapshot panel -- see
 * control-plane/internal/streaming.TopicInfo. */
export interface KafkaTopic {
  name: string;
  partitions: number;
  messageCount: number;
}

/** One trip record read off the yellow-taxi-trips topic. camelCase and
 * translated from the wire JSON's original TLC column names
 * (tpep_pickup_datetime, PULocationID, ...) in infrastructure/
 * httpStreamingGateway.ts, not here -- domain types stay framework/wire
 * agnostic, same convention as every other domain in this app. */
export interface TripEvent {
  pickupAt: string;
  dropoffAt: string;
  pickupLocationId: number;
  dropoffLocationId: number;
  passengerCount: number;
  tripDistanceMiles: number;
  fareAmount: number;
  tipAmount: number;
  totalAmount: number;
  paymentType: number;
}

/** A rolling ~2s summary of recent trip events, computed server-side by
 * control-plane/internal/streaming.Consumer and pushed over the WS -- the
 * frontend never computes this itself. */
export interface WindowAggregate {
  tripCount: number;
  messagesPerSecond: number;
  totalRevenue: number;
  avgFare: number;
  avgDistanceMiles: number;
  windowEndedAt: string;
}

/** Params for POST /api/jobs/replay/run (see worker/jobs/replay.py).
 * date is optional -- omitted means "the latest available Silver pickup
 * date", resolved server-side, not guessed here. */
export interface ReplayParams {
  date?: string;
  limit: number;
  messagesPerSecond: number;
}

/** Tagged union carried over the live WebSocket -- mirrors
 * control-plane/internal/streaming.Frame. */
export type StreamFrame = { type: 'trip'; trip: TripEvent } | { type: 'window'; window: WindowAggregate };

/** Unlike every other screen in this app, Streaming is inherently
 * WebSocket-lifecycle-dependent -- this is shown as a connection-status
 * indicator on the screen itself. */
export type ConnectionStatus = 'connecting' | 'live' | 'disconnected';
