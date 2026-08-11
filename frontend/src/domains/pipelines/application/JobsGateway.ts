import type { JobRun } from '../domain/entities';

export interface RunsPage {
  runs: JobRun[];
  hasMore: boolean;
}

/**
 * Port: the read half of the pipelines domain -- job run history.
 * infrastructure/ provides mock and http implementations.
 */
export interface JobsGateway {
  fetchRuns(opts?: { limit?: number; offset?: number }): Promise<RunsPage>;
  clearRuns(): Promise<void>;
}
