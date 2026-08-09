import type { Status } from '@/shared/types/status';

export interface ServiceHealth {
  id: string;
  name: string;
  status: Status;
  /** e.g. "4.1ms · lake@9000" -- latency/port summary shown under the name. */
  detail: string;
}

export interface SystemHealthSummary {
  services: ServiceHealth[];
  overallStatus: Status;
}
