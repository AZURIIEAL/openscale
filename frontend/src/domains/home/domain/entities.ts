import type { Status } from '@/shared/types/status';

export type GaugeColor = 'accent' | 'good' | 'warn' | 'crit';

export interface ResourceGauge {
  id: string;
  label: string;
  sublabel: string;
  /** The used/total split of `sublabel` (e.g. "3.4 GB" / "15.5 GB") -- kept
   * apart from the combined string so the Connections chart-style picker's
   * meter treatments (capsule, ledger, ...) can show each half on its own,
   * without re-parsing `sublabel`'s "X / Y unit" text. */
  usedLabel: string;
  totalLabel: string;
  valuePercent: number;
  color: GaugeColor;
}

export interface HomeStat {
  id: string;
  label: string;
  value: string;
}

export interface PipelineRunSummary {
  id: string;
  jobName: string;
  startedAt: string;
  durationLabel: string;
  status: Status;
  rowsProcessed?: number;
}

export interface RevenueTrend {
  /** Chronological, oldest first. */
  values: number[];
  totalLabel: string;
  changeLabel: string;
}

export interface HomeOverview {
  gauges: ResourceGauge[];
  revenueTrend: RevenueTrend;
  stats: HomeStat[];
  recentRuns: PipelineRunSummary[];
}

export interface ContainerResourceStat {
  id: string;
  name: string;
  image: string;
  cpuPercent: number;
  memUsageBytes: number;
  memLimitBytes: number;
  memPercent: number;
}

export interface ResourceTotals {
  /** Host-wide: 100 == every online core fully busy across all containers. */
  cpuPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  memPercent: number;
  numCpu: number;
}

export interface ContainerStatsSnapshot {
  containers: ContainerResourceStat[];
  totals: ResourceTotals;
}
