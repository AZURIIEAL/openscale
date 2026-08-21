import { Panel } from '@/shared/design-system/Panel';
import { DeltaChip } from '@/shared/design-system/DeltaChip';
import { ConsoleBarChart } from '@/shared/design-system/ConsoleBarChart';
import { useThemeStore } from '@/app/theme-store';
import { formatCurrency } from '@/domains/dashboards/domain/rules';
import { ContainerLoadMeters } from './ContainerLoadMeters';
import type { ResourceGauge, RevenueTrend } from '../domain/entities';

interface GaugeRowProps {
  gauges: ResourceGauge[];
  revenueTrend: RevenueTrend;
}

/** "Container Load" (live memory/CPU meters) side by side with "Daily
 * Revenue" (14-day trend chart) -- the redesign's two-column header row,
 * replacing the old three-up gauge/sparkline grid. */
export function GaugeRow({ gauges, revenueTrend }: GaugeRowProps) {
  const chartStyle = useThemeStore((s) => s.chartStyle);
  const positive = !revenueTrend.changeLabel.includes('▼');

  const chartData = revenueTrend.values.map((v, i) => ({ label: String(i + 1), a: v, b: 0 }));

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 0.95fr) minmax(0, 2.2fr)' }}>
      <Panel>
        <header>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>Container Load</h3>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>Live, across every running service</p>
        </header>
        {/* This panel stretches to match Daily Revenue's height (the grid
           row no longer clips it to its own content via items-start,
           which left a gap of bare canvas below a shorter Container Load
           on compact meter treatments like ticks/grid); any surplus height
           just settles below the meters rather than being distributed
           around them, which read as the content floating unanchored from
           its own header. */}
        <div className="mt-4">
          <ContainerLoadMeters gauges={gauges} variant={chartStyle} />
        </div>
      </Panel>

      <Panel>
        <header>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>Daily Revenue</h3>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>Last 14 days</p>
        </header>
        <div className="my-3 flex items-baseline gap-2.5">
          <span className="os-tabular-nums" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {revenueTrend.totalLabel}
          </span>
          <DeltaChip value={revenueTrend.changeLabel.replace(/[▲▼]\s*/, '')} direction={positive ? 'up' : 'down'} caption="than last period" />
        </div>
        <ConsoleBarChart
          data={chartData}
          seriesLabels={['Revenue', '']}
          variant={chartStyle}
          height={180}
          formatTick={formatCurrency}
        />
      </Panel>
    </div>
  );
}
