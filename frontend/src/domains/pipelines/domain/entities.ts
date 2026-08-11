export type JobState = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';

export interface JobRun {
  id: string;
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

export interface JobParamField {
  name: string;
  label: string;
  placeholder: string;
}

export interface JobDefinition {
  type: string;
  label: string;
  description: string;
  /** Present only for job types that need user-supplied parameters before
   * running (currently just ingest's date range). Absent means the job
   * runs immediately on click with no configuration step -- it processes
   * whatever is currently available upstream (all of Bronze, all of
   * Silver, etc). */
  paramFields?: JobParamField[];
}

/** Job catalog -- hardcoded here, mirroring system-health's
 * mockSystemHealthGateway/watchedServices precedent, since this is
 * deliberately Phase 2 scope ("control the existing pipeline"), not a
 * generic job-registration system. All five stages are real and
 * triggerable -- ingest through train, mirroring the full Bronze -> Silver
 * -> Gold -> Features -> Train pipeline. */
export const JOB_CATALOG: JobDefinition[] = [
  {
    type: 'ingest',
    label: 'Ingest (Bronze)',
    description: 'Download/validate TLC parquet for a month range, write to Bronze in MinIO.',
    paramFields: [
      { name: 'start', label: 'Start (YYYY-MM)', placeholder: '2024-07' },
      { name: 'end', label: 'End (YYYY-MM)', placeholder: '2024-12' },
    ],
  },
  {
    type: 'silver',
    label: 'Validate (Silver)',
    description: 'Bronze -> Silver: reject/quarantine/flag invalid rows, write clean trips.',
  },
  {
    type: 'gold',
    label: 'Aggregate (Gold)',
    description: 'Silver -> Gold: daily revenue, hourly demand, zone stats, congestion metrics.',
  },
  {
    type: 'features',
    label: 'Compute Features',
    description: 'Silver -> zone x hour features, written to Postgres and Redis.',
  },
  {
    type: 'train',
    label: 'Train Fare Model',
    description: 'Samples Silver trips, trains a fare-prediction model, logs it to MLflow.',
  },
];
