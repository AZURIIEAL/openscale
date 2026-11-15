import type { JobDefinition, JobRun } from '../domain/entities';

export interface RunsPage {
  runs: JobRun[];
  hasMore: boolean;
}

/**
 * Port: the read half of the pipelines domain -- the job catalog and job
 * run history. infrastructure/ provides mock and http implementations.
 */
export interface JobsGateway {
  /** Every job type the worker publishes (GET /api/jobs/catalog). The same
   * for every project, so it takes no slug. */
  fetchCatalog(): Promise<JobDefinition[]>;
  /** `projectSlug` is the slug from the current /p/:projectSlug route; the
   * control-plane accepts it in place of the project id. */
  fetchRuns(projectSlug: string, opts?: { limit?: number; offset?: number }): Promise<RunsPage>;
  clearRuns(projectSlug: string): Promise<void>;
  /** Cancels every currently queued/running run of the project. Queued ones
   * are skipped by the worker; running ones have their job process stopped
   * -- see CancelAll in the Go control-plane's internal/api/jobs_handler.go. */
  cancelAllRuns(projectSlug: string): Promise<void>;
}
