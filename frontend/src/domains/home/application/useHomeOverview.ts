import { useQuery } from '@tanstack/react-query';
import { mockHomeGateway } from '../infrastructure/mockHomeGateway';
import { httpJobsGateway } from '@/domains/pipelines/infrastructure/httpJobsGateway';
import { deriveRunStatus, stateLabel } from '@/domains/pipelines/domain/rules';
import type { JobRun } from '@/domains/pipelines/domain/entities';
import type { HomeOverview, PipelineRunSummary } from '../domain/entities';

const gateway = mockHomeGateway;

function formatDuration(startedAt?: string, finishedAt?: string): string {
  if (!startedAt) return '—';
  const endMs = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((endMs - new Date(startedAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function toRunSummary(run: JobRun): PipelineRunSummary {
  return {
    id: run.id,
    jobName: run.state === 'running' || run.state === 'queued' ? `${run.jobType} (${stateLabel(run.state)})` : run.jobType,
    startedAt: run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : '—',
    durationLabel: formatDuration(run.startedAt, run.finishedAt),
    status: deriveRunStatus(run.state),
  };
}

/**
 * Gauges/stats/revenue trend stay on the mock overview (no backend for
 * those yet) but recent runs are real -- pipelines is the one domain with
 * an actual control-plane behind it, so Home reads its history the same
 * way HealthStrip reads system-health's, rather than showing stale mock
 * job names next to genuinely triggered runs.
 */
export function useHomeOverview() {
  return useQuery({
    queryKey: ['home', 'overview'],
    queryFn: async (): Promise<HomeOverview> => {
      const [overview, runs] = await Promise.all([
        gateway.fetchOverview(),
        httpJobsGateway.fetchRuns().catch(() => [] as JobRun[]),
      ]);
      return runs.length > 0 ? { ...overview, recentRuns: runs.slice(0, 5).map(toRunSummary) } : overview;
    },
    refetchInterval: 15_000,
  });
}
