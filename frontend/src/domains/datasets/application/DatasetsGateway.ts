import type { QueryError, QueryResult } from '@/domains/sql-editor/domain/entities';
import type { CreateFromUrlInput, Dataset, DatasetProfile, UploadInput } from '../domain/entities';
import type { JobRun } from '@/domains/pipelines/domain/entities';

export interface CreateDatasetResponse {
  dataset: Dataset;
  run: JobRun;
}

/** Port for a project's datasets. Every method takes the project slug. */
export interface DatasetsGateway {
  list(projectSlug: string): Promise<Dataset[]>;
  get(projectSlug: string, name: string): Promise<Dataset>;
  upload(projectSlug: string, input: UploadInput): Promise<CreateDatasetResponse>;
  addFile(projectSlug: string, name: string, input: UploadInput): Promise<CreateDatasetResponse>;
  createFromUrl(projectSlug: string, input: CreateFromUrlInput): Promise<CreateDatasetResponse>;
  remove(projectSlug: string, name: string): Promise<void>;
  preview(projectSlug: string, name: string, limit?: number): Promise<QueryResult | QueryError>;
  profile(projectSlug: string, name: string): Promise<DatasetProfile>;
}
