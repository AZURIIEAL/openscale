import { apiPost } from '@/shared/api/httpClient';
import type { JobControlGateway } from '../application/JobControlGateway';
import { mapApiJobRun, type ApiJobRun } from './apiMapping';

export const httpJobControlGateway: JobControlGateway = {
  async triggerRun(jobType, params) {
    const run = await apiPost<ApiJobRun>(`/api/jobs/${jobType}/run`, params);
    return mapApiJobRun(run);
  },
};
