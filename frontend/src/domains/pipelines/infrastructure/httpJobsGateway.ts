import { apiDelete, apiGet, apiPost } from '@/shared/api/httpClient';
import type { JobsGateway, RunsPage } from '../application/JobsGateway';
import { mapApiJobRun, type ApiJobRun } from './apiMapping';

interface ApiRunsResponse {
  runs: ApiJobRun[];
  hasMore: boolean;
}

export const httpJobsGateway: JobsGateway = {
  async fetchRuns({ limit = 20, offset = 0 } = {}): Promise<RunsPage> {
    const res = await apiGet<ApiRunsResponse>(`/api/jobs/runs?limit=${limit}&offset=${offset}`);
    return { runs: res.runs.map(mapApiJobRun), hasMore: res.hasMore };
  },
  async clearRuns() {
    await apiDelete('/api/jobs/runs');
  },
  async cancelAllRuns() {
    await apiPost('/api/jobs/cancel-all');
  },
};
