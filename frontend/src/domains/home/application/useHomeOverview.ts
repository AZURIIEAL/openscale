import { useQuery } from '@tanstack/react-query';
import { mockHomeGateway } from '../infrastructure/mockHomeGateway';
import { httpJobsGateway } from '@/domains/pipelines/infrastructure/httpJobsGateway';
import { fetchHomeStats, type ApiHomeStats } from '../infrastructure/httpHomeStatsGateway';
import { deriveRunStatus, formatRunDuration, formatRunTime } from '@/domains/pipelines/domain/rules';
import { formatCount, formatCurrency } from '@/domains/dashboards/domain/rules';
import type { JobRun } from '@/domains/pipelines/domain/entities';
import type { HomeOverview, HomeStat, PipelineRunSummary, RevenueTrend } from '../domain/entities';

const gateway = mockHomeGateway;

function toRunSummary(run: JobRun): PipelineRunSummary {
  return {
    id: run.id,
    jobName: run.jobType,
    startedAt: formatRunTime(run.startedAt),
    durationLabel: formatRunDuration(run.startedAt, run.finishedAt, run.state),
    status: deriveRunStatus(run.state),
    rowsProcessed: run.rowsProcessed,
  };
}

/** "Gold tables" is a fixed fact about the system (4 Gold jobs exist,
 * see dashboards/domain), not a runtime metric -- same treatment
 * PIPELINE_ORDER already gets, so it's not worth a query. */
const GOLD_TABLE_COUNT = '4';

function toHomeStats(stats: ApiHomeStats): HomeStat[] {
  return [
    {
      id: 'silver-rows',
      label: 'Silver rows processed',
      value: stats.silverRowsProcessed != null ? formatCount(stats.silverRowsProcessed) : '—',
    },
    { id: 'months', label: 'months ingested', value: String(stats.monthsIngested) },
    { id: 'gold-tables', label: 'Gold tables', value: GOLD_TABLE_COUNT },
    {
      id: 'fare-mae',
      label: 'fare model MAE',
      value: stats.fareModelMae != null ? `$${stats.fareModelMae.toFixed(2)}` : '—',
    },
  ];
}

function toRevenueTrend(stats: ApiHomeStats, fallback: RevenueTrend): RevenueTrend {
  const values = stats.revenueTrend14d.map((p) => p.totalRevenue ?? 0);
  if (values.length < 2) return fallback;

  const total = values.reduce((sum, v) => sum + v, 0);
  const first = values[0];
  const last = values[values.length - 1];
  const changePct = first !== 0 ? ((last - first) / first) * 100 : 0;

  return {
    values,
    totalLabel: formatCurrency(total),
    changeLabel: `${changePct >= 0 ? '▲' : '▼'} ${Math.abs(changePct).toFixed(1)}%`,
  };
}

/**
 * Gauges come from live container stats (see useContainerStats), recent
 * runs and stats/revenue trend come from the control-plane's job history
 * and Gold data -- only the gauge *shape* defaults fall back to the mock
 * overview now, same graceful-fallback pattern already used for runs.
 */
export function useHomeOverview() {
  return useQuery({
    queryKey: ['home', 'overview'],
    queryFn: async (): Promise<HomeOverview> => {
      const [overview, page, homeStats] = await Promise.all([
        gateway.fetchOverview(),
        httpJobsGateway.fetchRuns({ limit: 5, offset: 0 }).catch(() => ({ runs: [] as JobRun[], hasMore: false })),
        fetchHomeStats().catch(() => null as ApiHomeStats | null),
      ]);
      return {
        ...overview,
        ...(page.runs.length > 0 ? { recentRuns: page.runs.map(toRunSummary) } : {}),
        ...(homeStats
          ? { stats: toHomeStats(homeStats), revenueTrend: toRevenueTrend(homeStats, overview.revenueTrend) }
          : {}),
      };
    },
    refetchInterval: 15_000,
  });
}
