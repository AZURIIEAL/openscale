import { Panel } from '@/shared/design-system/Panel';
import { useDashboardsOverview } from '../application/useDashboardsOverview';
import {
  formatCount,
  formatCurrency,
  formatDurationSeconds,
  formatHourLabel,
  formatPercent,
  formatShortDate,
} from '../domain/rules';
import { ChartPanel } from './ChartPanel';
import { TrendChart } from './charts/TrendChart';
import { BarChart } from './charts/BarChart';
import { HorizontalBarChart } from './charts/HorizontalBarChart';
import type { JobTypeHealth } from '../domain/entities';

function sum(values: (number | undefined)[]): number {
  return values.reduce<number>((total, v) => total + (v ?? 0), 0);
}

function EtlHealthRow({ health }: { health: JobTypeHealth }) {
  const total = health.succeeded + health.partial + health.failed || 1;
  const segments: { count: number; color: string }[] = [
    { count: health.succeeded, color: 'var(--good)' },
    { count: health.partial, color: 'var(--warn)' },
    { count: health.failed, color: 'var(--crit)' },
  ];

  return (
    <div className="flex items-center gap-3">
      <span className="os-font-mono w-20 flex-shrink-0 text-[12px]" style={{ color: 'var(--ink)' }}>
        {health.jobType}
      </span>
      <div className="flex h-3 flex-1 overflow-hidden rounded" style={{ background: 'var(--shadow-lo)' }}>
        {segments.map((seg, i) =>
          seg.count > 0 ? <div key={i} style={{ width: `${(seg.count / total) * 100}%`, background: seg.color }} /> : null,
        )}
      </div>
      <span className="os-font-mono os-tabular-nums w-24 flex-shrink-0 text-right text-[11px]" style={{ color: 'var(--ink-muted)' }}>
        {formatDurationSeconds(health.avgDurationSeconds)} avg
      </span>
      <span className="os-font-mono os-tabular-nums w-28 flex-shrink-0 text-right text-[11px]" style={{ color: 'var(--ink-muted)' }}>
        {health.succeeded}✓ {health.partial}~ {health.failed}✗
      </span>
    </div>
  );
}

export function DashboardsScreen() {
  const { data, isLoading, isError } = useDashboardsOverview();

  if (isError) {
    return (
      <div className="text-sm" style={{ color: 'var(--crit)' }}>
        Failed to load dashboards. Is the control-plane running?
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>
        Loading dashboards…
      </div>
    );
  }

  const hasAnyGoldData = data.dailyRevenue.length > 0 || data.hourlyDemand.length > 0 || data.topZones.length > 0;

  if (!hasAnyGoldData) {
    return (
      <Panel className="p-6 text-sm" style={{ color: 'var(--ink-muted)' }}>
        No Gold data yet -- run the Silver and Gold pipelines from the Pipelines screen first, then come back here.
      </Panel>
    );
  }

  const latestModelMetric = data.modelMetrics[data.modelMetrics.length - 1];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartPanel title="Daily revenue" value={formatCurrency(sum(data.dailyRevenue.map((d) => d.totalRevenue)))}>
        <TrendChart
          color="good"
          points={data.dailyRevenue.map((d) => ({ label: formatShortDate(d.date), value: d.totalRevenue ?? 0 }))}
          valueFormatter={formatCurrency}
        />
      </ChartPanel>

      <ChartPanel title="Daily trip volume" value={formatCount(sum(data.dailyRevenue.map((d) => d.tripCount)))}>
        <TrendChart
          points={data.dailyRevenue.map((d) => ({ label: formatShortDate(d.date), value: d.tripCount }))}
          valueFormatter={formatCount}
        />
      </ChartPanel>

      <ChartPanel
        title="Avg fare trend"
        value={formatCurrency(data.dailyRevenue[data.dailyRevenue.length - 1]?.avgFare)}
      >
        <TrendChart
          color="accent"
          points={data.dailyRevenue.map((d) => ({ label: formatShortDate(d.date), value: d.avgFare ?? 0 }))}
          valueFormatter={formatCurrency}
        />
      </ChartPanel>

      <ChartPanel title="Demand by hour of day" value={formatCount(sum(data.hourlyDemand.map((h) => h.tripCount)))}>
        <BarChart
          points={data.hourlyDemand.map((h) => ({ label: formatHourLabel(h.hour), value: h.tripCount }))}
          valueFormatter={formatCount}
          labelStride={3}
        />
      </ChartPanel>

      <ChartPanel title="Avg fare by hour" value={formatCurrency(data.hourlyDemand[0]?.avgFare)}>
        <BarChart
          color="warn"
          points={data.hourlyDemand.map((h) => ({ label: formatHourLabel(h.hour), value: h.avgFare ?? 0 }))}
          valueFormatter={formatCurrency}
          labelStride={3}
        />
      </ChartPanel>

      <ChartPanel title="Congestion surcharge trend" value={formatCurrency(sum(data.congestion.map((c) => c.totalCongestionSurcharge)))}>
        <TrendChart
          color="warn"
          points={data.congestion.map((c) => ({ label: formatShortDate(c.date), value: c.totalCongestionSurcharge ?? 0 }))}
          valueFormatter={formatCurrency}
        />
      </ChartPanel>

      <ChartPanel title="% trips with congestion pricing" value={formatPercent(data.congestion[data.congestion.length - 1]?.congestionTripPct)}>
        <TrendChart
          color="accent"
          points={data.congestion.map((c) => ({ label: formatShortDate(c.date), value: c.congestionTripPct ?? 0 }))}
          valueFormatter={formatPercent}
        />
      </ChartPanel>

      <ChartPanel
        title="Model quality over retrains"
        value={latestModelMetric?.r2 !== undefined ? `R² ${latestModelMetric.r2.toFixed(2)}` : undefined}
      >
        {data.modelMetrics.length < 2 ? (
          <div className="flex flex-col items-center justify-center gap-1 text-center text-[12px]" style={{ height: 120, color: 'var(--ink-faint)' }}>
            <span>Only one completed train run so far.</span>
            <span>MAE ${latestModelMetric?.mae?.toFixed(2)} · RMSE ${latestModelMetric?.rmse?.toFixed(2)} -- retrain again to see a trend.</span>
          </div>
        ) : (
          <>
            <TrendChart
              color="crit"
              points={data.modelMetrics.map((m) => ({
                label: new Date(m.finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                value: m.mae ?? 0,
              }))}
              valueFormatter={(v) => `MAE $${v.toFixed(2)}`}
            />
            <div className="os-font-mono text-[10.5px]" style={{ color: 'var(--ink-muted)' }}>
              Latest: MAE ${latestModelMetric?.mae?.toFixed(2)} · RMSE ${latestModelMetric?.rmse?.toFixed(2)} · R² {latestModelMetric?.r2?.toFixed(3)}
            </div>
          </>
        )}
      </ChartPanel>

      <ChartPanel title="Top 10 pickup zones by volume" className="lg:col-span-2">
        <HorizontalBarChart
          points={data.topZones.map((z) => ({ label: `Zone ${z.zoneId}`, value: z.tripCount }))}
          valueFormatter={formatCount}
        />
      </ChartPanel>

      <ChartPanel title="ETL pipeline health" className="lg:col-span-2">
        {data.etlHealth.length === 0 ? (
          <div className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
            No completed runs yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.etlHealth.map((h) => (
              <EtlHealthRow key={h.jobType} health={h} />
            ))}
          </div>
        )}
      </ChartPanel>
    </div>
  );
}
