import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/api/httpClient';
import { projectApiPath } from '@/shared/project/rules';
import type { PipelinesGateway } from '../application/PipelinesGateway';
import type { Pipeline, PipelineRun } from '../domain/entities';

// The wire shapes are the control-plane's pipelines.Pipeline / Run, already the domain's.
const path = (slug: string, name: string, rest = '') => projectApiPath(slug, `pipelines/${encodeURIComponent(name)}${rest}`);

export const httpPipelinesGateway: PipelinesGateway = {
  list: (slug) => apiGet<Pipeline[]>(projectApiPath(slug, 'pipelines')),
  create: (slug, input) => apiPost<Pipeline>(projectApiPath(slug, 'pipelines'), input),
  update: (slug, input) => apiPut<Pipeline>(path(slug, input.name), input),
  remove: (slug, name) => apiDelete(path(slug, name)),
  run: (slug, name, params) => apiPost<PipelineRun>(path(slug, name, '/run'), params ? { params } : undefined),
  listRuns: (slug) => apiGet<PipelineRun[]>(projectApiPath(slug, 'pipeline-runs?limit=20')),
  cancelRun: (slug, id) => apiPost<PipelineRun>(projectApiPath(slug, `pipeline-runs/${encodeURIComponent(id)}/cancel`)),
};
