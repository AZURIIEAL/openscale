import type { JobRun } from '@/domains/pipelines/domain/entities';
import type { KafkaTopic, ReplayParams, StreamFrame, ConnectionStatus } from '../domain/entities';

/**
 * Port: the Streaming domain's three reads/writes -- the topic admin
 * snapshot, triggering a replay run (reuses the pipelines domain's
 * JobRun shape/trigger call, see infrastructure/httpStreamingGateway.ts),
 * and the live WebSocket feed. infrastructure/ provides mock and http
 * implementations, mirroring sql-editor/application/QueryGateway.ts.
 */
export interface StreamingGateway {
  listTopics(): Promise<{ topics: KafkaTopic[]; brokerReachable: boolean }>;
  startReplay(params: ReplayParams): Promise<JobRun>;
  /** Opens the live WebSocket feed. onFrame fires for every trip/window
   * frame; onStatusChange (optional) tracks the connection lifecycle for a
   * status indicator. Returns a cleanup function that closes the socket
   * and cancels any pending reconnect. */
  connect(onFrame: (frame: StreamFrame) => void, onStatusChange?: (status: ConnectionStatus) => void): () => void;
}
