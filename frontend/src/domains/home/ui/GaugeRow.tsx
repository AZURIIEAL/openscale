import { Panel } from '@/shared/design-system/Panel';
import { Gauge } from '@/shared/design-system/Gauge';
import { Sparkline } from '@/shared/design-system/Sparkline';
import type { ResourceGauge, RevenueTrend } from '../domain/entities';

interface GaugeRowProps {
  gauges: ResourceGauge[];
  revenueTrend: RevenueTrend;
}

export function GaugeRow({ gauges, revenueTrend }: GaugeRowProps) {
  return (
    <div className="mb-4 grid grid-cols-[1.1fr_1.1fr_1.6fr] items-stretch gap-4">
      {gauges.map((gauge) => (
        <Panel key={gauge.id} className="flex flex-col items-center gap-2.5 p-[18px]">
          <Gauge value={gauge.valuePercent} label={gauge.label} sublabel={gauge.sublabel} color={gauge.color} />
        </Panel>
      ))}

      <Panel className="flex flex-col gap-2.5 px-5 py-[18px]">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
            Daily Revenue — last 14 days
          </span>
          <span className="os-font-display text-[22px]">
            {revenueTrend.totalLabel}
            <span className="os-font-mono ml-1.5 text-xs font-medium" style={{ color: 'var(--good)' }}>
              {revenueTrend.changeLabel}
            </span>
          </span>
        </div>
        <Sparkline values={revenueTrend.values} />
      </Panel>
    </div>
  );
}
