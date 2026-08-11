import type { JobRun } from '../domain/entities';

/**
 * Port: the write half of the pipelines domain -- triggering a job run.
 * Returns the freshly-created run (with its server-assigned id) so the UI
 * can update immediately, same pattern as ServiceControlGateway.
 */
export interface JobControlGateway {
  triggerRun(jobType: string, params: Record<string, string>): Promise<JobRun>;
}
