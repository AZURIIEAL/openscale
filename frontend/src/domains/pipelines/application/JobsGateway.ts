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
  /** `projectSlug` is the slug from the current /p/:projectSlug route; the
   * control-plane accepts it in place of the project id. */
  fetchRuns(projectSlug: string, opts?: { limit?: number; offset?: number }): Promise<RunsPage>;
  clearRuns(projectSlug: string): Promise<void>;
  /** Cancels every currently queued/running run. Queued ones are skipped by
   * the worker cooperatively; the one actively running is stopped by
   * restarting the worker container -- see CancelAll in the Go
   * control-plane's internal/api/jobs_handler.go for why. */
  cancelAllRuns(projectSlug: string): Promise<void>;
}
