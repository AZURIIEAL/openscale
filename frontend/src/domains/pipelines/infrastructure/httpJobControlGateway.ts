import { apiPost } from '@/shared/api/httpClient';
import { projectApiPath } from '@/shared/project/rules';
import type { JobControlGateway } from '../application/JobControlGateway';
import { mapApiJobRun, type ApiJobRun } from './apiMapping';

export const httpJobControlGateway: JobControlGateway = {
  async triggerRun(projectSlug, jobType, params) {
    const run = await apiPost<ApiJobRun>(projectApiPath(projectSlug, `jobs/${jobType}/run`), params);
    return mapApiJobRun(run);
  },
};
