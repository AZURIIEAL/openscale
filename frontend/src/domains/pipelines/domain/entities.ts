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
  /** Present only for job types that are actually triggerable. Absent
   * entries render as visibly "coming soon" -- honest about what's real. */
  paramFields?: JobParamField[];
}

/** Job catalog -- hardcoded here, mirroring system-health's
 * mockSystemHealthGateway/watchedServices precedent, since this is
 * deliberately Phase 2 scope ("control the existing pipeline"), not a
 * generic job-registration system. `ingest` is the one real, triggerable
 * job; the rest mirror the roadmap's next stages and Home's existing mock
 * job names, shown for context but disabled. */
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
  { type: 'silver', label: 'Validate (Silver)', description: 'Bronze -> Silver quality rules. Not wired up yet.' },
  { type: 'gold', label: 'Aggregate (Gold)', description: 'Silver -> Gold aggregation jobs. Not wired up yet.' },
  { type: 'features', label: 'Compute Features', description: 'Zone x hour features -> Postgres/Redis. Not wired up yet.' },
  { type: 'train', label: 'Train Fare Model', description: 'Fare-prediction training + MLflow. Not wired up yet.' },
];
