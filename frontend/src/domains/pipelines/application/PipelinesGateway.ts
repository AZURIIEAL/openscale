import type { Pipeline, PipelineRun, PipelineStep } from '../domain/entities';

export interface PipelineInput {
  name: string;
  description: string;
  steps: PipelineStep[];
}

/** Port: a project's saved pipelines and their runs. */
export interface PipelinesGateway {
  list(projectSlug: string): Promise<Pipeline[]>;
  create(projectSlug: string, input: PipelineInput): Promise<Pipeline>;
  update(projectSlug: string, input: PipelineInput): Promise<Pipeline>;
  remove(projectSlug: string, name: string): Promise<void>;
  /** `params`, when given, replace the first step's saved params for this run. */
  run(projectSlug: string, name: string, params?: Record<string, unknown>): Promise<PipelineRun>;
  listRuns(projectSlug: string): Promise<PipelineRun[]>;
  cancelRun(projectSlug: string, id: string): Promise<PipelineRun>;
}
