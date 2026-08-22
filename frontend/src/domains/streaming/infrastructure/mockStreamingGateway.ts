import type { JobRun } from '@/domains/pipelines/domain/entities';
import type { StreamingGateway } from '../application/StreamingGateway';
import type { TripEvent } from '../domain/entities';

/**
 * Adapter: stands in for the control-plane's /api/streaming/* endpoints
 * when it's unreachable, mirroring sql-editor/infrastructure/
 * mockQueryGateway's convention. Not wired up by default --
 * application/useKafkaTopics.ts, useStartReplay.ts, and
 * useLiveTripStream.ts all point at httpStreamingGateway instead.
 */
const MOCK_TRIP: TripEvent = {
  pickupAt: '2024-01-01T08:15:00.000Z',
  dropoffAt: '2024-01-01T08:31:00.000Z',
  pickupLocationId: 132,
  dropoffLocationId: 236,
  passengerCount: 1,
  tripDistanceMiles: 3.2,
  fareAmount: 14.5,
  tipAmount: 2.5,
  totalAmount: 19.3,
  paymentType: 1,
};

export const mockStreamingGateway: StreamingGateway = {
  async listTopics() {
    return {
      topics: [{ name: 'yellow-taxi-trips', partitions: 1, messageCount: 1245 }],
      brokerReachable: true,
    };
  },

  async startReplay(params) {
    const now = new Date().toISOString();
    return {
      id: 'mock-replay-run',
      jobType: 'replay',
      params: { ...params },
      state: 'succeeded',
      submittedAt: now,
      finishedAt: now,
      rowsProcessed: params.limit,
    } satisfies JobRun;
  },

  connect(onFrame, onStatusChange) {
    onStatusChange?.('live');
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      onFrame({ type: 'trip', trip: { ...MOCK_TRIP, pickupLocationId: 100 + (i % 50) } });
      if (i % 2 === 0) {
        onFrame({
          type: 'window',
          window: {
            tripCount: 4,
            messagesPerSecond: 2,
            totalRevenue: 77.2,
            avgFare: 14.5,
            avgDistanceMiles: 3.2,
            windowEndedAt: new Date().toISOString(),
          },
        });
      }
    }, 2000);
    return () => clearInterval(interval);
  },
};
