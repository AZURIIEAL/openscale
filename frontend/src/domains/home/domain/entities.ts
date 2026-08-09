import type { Status } from '@/shared/types/status';

export type GaugeColor = 'accent' | 'good' | 'warn' | 'crit';

export interface ResourceGauge {
  id: string;
  label: string;
  sublabel: string;
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
