import type { Status } from '@/shared/types/status';

export interface ServiceHealth {
  id: string;
  name: string;
  status: Status;
  /** e.g. "4.1ms · lake@9000" -- latency/port summary shown under the name. */
  detail: string;
  /** Link to the service's own web UI, if it has one (e.g. MinIO console,
   * Grafana). Absent for protocol-only services (Kafka, Postgres, Redis) --
   * those render as non-clickable. */
  consoleUrl?: string;
  /** The container's actual running state, separate from `status` (which
   * also folds in healthcheck results). A service can be `status: 'crit'`
   * while still running -- start/stop controls key off this, not status. */
  running: boolean;
}

export interface SystemHealthSummary {
  services: ServiceHealth[];
  overallStatus: Status;
}
