import type { JobsGateway } from '../application/JobsGateway';
import type { JobRun } from '../domain/entities';

/**
 * Adapter: stands in for the future GET /api/jobs/runs endpoint. Reuses
 * the same job names Home's mockHomeGateway already shows in its Recent
 * Runs table, so the two stay visually consistent while both are mocked.
 */
const MOCK_RUNS: JobRun[] = [
  { id: 'r1', jobType: 'gold', params: {}, state: 'succeeded', submittedAt: '2026-08-11T09:41:02Z' },
  { id: 'r2', jobType: 'features', params: {}, state: 'succeeded', submittedAt: '2026-08-11T09:38:55Z' },
  { id: 'r3', jobType: 'train', params: {}, state: 'succeeded', submittedAt: '2026-08-11T09:31:20Z' },
  {
    id: 'r4',
    jobType: 'ingest',
    params: { start: '2026-05', end: '2026-05' },
    state: 'succeeded',
    submittedAt: '2026-08-11T08:55:41Z',
  },
];

export const mockJobsGateway: JobsGateway = {
  async fetchRuns({ limit = 20, offset = 0 } = {}) {
    return { runs: MOCK_RUNS.slice(offset, offset + limit), hasMore: offset + limit < MOCK_RUNS.length };
  },
  async clearRuns() {
    MOCK_RUNS.length = 0;
  },
  async cancelAllRuns() {
    for (const run of MOCK_RUNS) {
      if (run.state === 'queued' || run.state === 'running') run.state = 'cancelled';
    }
  },
};
