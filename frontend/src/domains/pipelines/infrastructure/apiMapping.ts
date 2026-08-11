import type { JobRun, JobState } from '../domain/entities';

/** Wire shape returned by the Go control-plane (internal/jobs.Run's JSON
 * tags) -- kept separate from the domain's own JobRun naming (`state`, not
 * `status`, since `status` is already the semantic Status type elsewhere)
 * so the API's exact shape doesn't leak past infrastructure/. */
export interface ApiJobRun {
  id: string;
  jobType: string;
  params: Record<string, unknown>;
  status: JobState;
  submittedAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  logOutput?: string;
}

export function mapApiJobRun(api: ApiJobRun): JobRun {
  return {
    id: api.id,
    jobType: api.jobType,
    params: api.params,
    state: api.status,
    submittedAt: api.submittedAt,
    startedAt: api.startedAt,
    finishedAt: api.finishedAt,
    error: api.error,
  };
}
