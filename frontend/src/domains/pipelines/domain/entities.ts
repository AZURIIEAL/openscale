export type JobState = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled';

export interface JobRun {
  id: string;
  projectId: string;
  jobType: string;
  params: Record<string, unknown>;
  state: JobState;
  submittedAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  /** Not every job type can report this cheaply (Gold's outputs are
   * aggregate tables, not a row-for-row count) -- absent means "not
   * reported", not "zero". */
  rowsProcessed?: number;
}

/** Field kinds a job's params schema may use -- mirrors PARAM_TYPES in
 * worker/registry.py. `dataset` is the name of a dataset in the project. */
export type ParamType = 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'date' | 'month' | 'dataset';

/** One field of a job's params schema, as the worker publishes it
 * (worker/registry.py's Param; control-plane jobs.ParamSpec). `min`/`max`
 * are numbers for number/integer fields and ISO strings for date/month
 * fields; `gte` names an earlier field this one must not be before. */
export interface ParamSpec {
  name: string;
  type: ParamType;
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
  min?: number | string;
  max?: number | string;
  gte?: string;
}

/** One job type from GET /api/jobs/catalog. The worker publishes the
 * catalog from its @job registry, so adding a job type needs no change
 * here. */
export interface JobDefinition {
  type: string;
  label: string;
  description: string;
  /** Optional badge next to the label (Bronze, Silver, ... Model). */
  stage?: string;
  /** False for jobs another screen queues (replay, reset, dataset jobs);
   * they stay out of the Pipelines run list. */
  listed: boolean;
  paramsSchema: ParamSpec[];
}

/** Raw form state: every field is edited as a string (checkboxes as
 * 'true'/'false'), and paramsFromValues() turns it into the typed body
 * the run endpoint validates. */
export type ParamValues = Record<string, string>;
