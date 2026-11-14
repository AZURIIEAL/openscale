/** Mirrors control-plane/internal/datasets.Dataset's JSON shape. */
export type DatasetStatus = 'pending' | 'ready' | 'failed';
export type DatasetLayer = 'bronze' | 'silver' | 'gold';

export interface DatasetSource {
  /** `derived`: written by a job (validate, sql_transform) from other datasets. */
  kind: 'upload' | 'url' | 'derived';
  url?: string;
  filename?: string;
  /** For derived datasets: the job, its run and the datasets it read (lineage). */
  job?: string;
  runId?: string;
  inputs?: string[];
  engine?: string;
}

export interface DatasetColumn {
  name: string;
  type: string;
}

export interface ProfileColumn {
  name: string;
  type: string;
  nullCount: number;
  nullShare: number;
  distinct?: number | null;
  min?: unknown;
  max?: unknown;
  mean?: number | null;
}

export interface DatasetProfile {
  rowCount: number;
  columns: ProfileColumn[];
  error?: string;
}

export interface Dataset {
  id: string;
  projectId: string;
  name: string;
  layer: DatasetLayer;
  status: DatasetStatus;
  source: DatasetSource;
  columns: DatasetColumn[];
  rowCount?: number;
  sizeBytes?: number;
  /** Quality rules, in priority order; run by the validate job. */
  rules: QualityRule[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFromUrlInput {
  name?: string;
  layer?: DatasetLayer;
  url: string;
}

export interface UploadInput {
  file: File;
  name?: string;
  layer?: DatasetLayer;
  /** 0..1 */
  onProgress?: (fraction: number) => void;
}

/**
 * One quality rule (control-plane datasets.Rule; the worker runs them with
 * libs/openscale/openscale/rules.py). `when` is a SQL condition over the
 * dataset's columns; list order is priority.
 */
export type RuleTier = 'reject' | 'quarantine' | 'flag' | 'monitor';

export interface QualityRule {
  id: string;
  tier: RuleTier;
  when: string;
  note?: string;
  /** Flag rules only: the boolean column added to kept rows. */
  column?: string;
}

/** One rule's counts from a test run. */
export interface RuleStat {
  id: string;
  tier: RuleTier;
  note: string;
  /** Rows the condition matched. */
  hits: number;
  /** Rows this rule removed (reject/quarantine; earlier rules win). */
  assigned: number | null;
  /** Kept rows the flag marks true (flag only). */
  flagged: number | null;
}

/** POST .../rules/test: the counts, or `error` naming the bad rule. */
export interface RulesTestResult {
  rowsIn?: number;
  rowsOut?: number;
  rejected?: number;
  quarantined?: number;
  rules?: RuleStat[];
  durationMs?: number;
  error?: string;
}
