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
 * worker/registry.py. `text` is multi-line (SQL); `dataset` picks an
 * existing dataset in the project and `dataset_name` names a new one;
 * `column`/`columns` pick from the columns of the dataset field named by
 * `of`. */
export type ParamType =
  | 'string'
  | 'text'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'date'
  | 'month'
  | 'dataset'
  | 'dataset_name'
  | 'column'
  | 'columns';

/** One field of a job's params schema, as the worker publishes it
 * (worker/registry.py's Param; control-plane jobs.ParamSpec). `min`/`max`
 * are numbers for number/integer fields and ISO strings for date/month
 * fields; `gte` names an earlier field this one must not be before; `of`
 * names the dataset field a column/columns field picks from. */
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
  of?: string;
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
  /** A project feature flag the job needs (the taxi stages need
   * legacy_taxi); the control-plane refuses it in other projects. */
  requiresFeature?: string;
  paramsSchema: ParamSpec[];
}

/** Raw form state: every field is edited as a string (checkboxes as
 * 'true'/'false'), except `columns` fields, which hold the picked names;
 * paramsFromValues() turns it into the typed body the run endpoint
 * validates. */
export type ParamValues = Record<string, string | string[]>;

/** One job of a pipeline, queued with `params` when its turn comes. */
export interface PipelineStep {
  jobType: string;
  params: Record<string, unknown>;
}

/** A saved chain of jobs (control-plane pipelines.Pipeline). */
export interface Pipeline {
  id: string;
  projectId: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  createdAt: string;
  updatedAt: string;
}

export type PipelineRunState = 'running' | 'succeeded' | 'failed' | 'cancelled';

/** The job run queued for one step of a pipeline run. */
export interface PipelineStepJob {
  stepIndex: number;
  runId: string;
  status: JobState;
}

/** One execution of a pipeline; the control-plane's orchestrator queues each
 * step after the previous one succeeds. `steps` are the steps it started
 * with, so editing the pipeline doesn't change it. */
export interface PipelineRun {
  id: string;
  projectId: string;
  pipelineId?: string;
  pipelineName: string;
  steps: PipelineStep[];
  status: PipelineRunState;
  currentStep: number;
  error?: string;
  submittedAt: string;
  finishedAt?: string;
  jobs: PipelineStepJob[];
}
