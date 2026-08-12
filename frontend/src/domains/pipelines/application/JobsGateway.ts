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
  /** Cancels every currently queued/running run. Queued ones are skipped by
   * the worker cooperatively; the one actively running is stopped by
   * restarting the worker container -- see CancelAll in the Go
   * control-plane's internal/api/jobs_handler.go for why. */
  cancelAllRuns(): Promise<void>;
}
