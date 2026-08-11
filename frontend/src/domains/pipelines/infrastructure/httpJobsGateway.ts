import { apiGet } from '@/shared/api/httpClient';
import type { JobsGateway } from '../application/JobsGateway';
import { mapApiJobRun, type ApiJobRun } from './apiMapping';

export const httpJobsGateway: JobsGateway = {
  async fetchRuns() {
    const runs = await apiGet<ApiJobRun[]>('/api/jobs/runs');
    return runs.map(mapApiJobRun);
  },
};
