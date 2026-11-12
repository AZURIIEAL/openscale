import { apiDelete, apiGet, apiPost } from '@/shared/api/httpClient';
import { projectApiPath } from '@/shared/project/rules';
import type { JobsGateway, RunsPage } from '../application/JobsGateway';
import { mapApiJobRun, type ApiJobRun } from './apiMapping';

interface ApiRunsResponse {
  runs: ApiJobRun[];
  hasMore: boolean;
}

export const httpJobsGateway: JobsGateway = {
  async fetchRuns(projectSlug, { limit = 20, offset = 0 } = {}): Promise<RunsPage> {
    const res = await apiGet<ApiRunsResponse>(projectApiPath(projectSlug, `jobs/runs?limit=${limit}&offset=${offset}`));
    return { runs: res.runs.map(mapApiJobRun), hasMore: res.hasMore };
  },
  async clearRuns(projectSlug) {
    await apiDelete(projectApiPath(projectSlug, 'jobs/runs'));
  },
  async cancelAllRuns(projectSlug) {
    await apiPost(projectApiPath(projectSlug, 'jobs/cancel-all'));
  },
};
