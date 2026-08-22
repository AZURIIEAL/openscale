import { Panel } from '@/shared/design-system/Panel';
import { TrendChart } from '@/domains/dashboards/ui/charts/TrendChart';
import { formatWindowTickLabel } from '../domain/rules';
import type { WindowAggregate } from '../domain/entities';

/**
 * Messages/sec over the last ~30 window ticks -- reuses dashboards'
 * generic TrendChart (accepts plain {label, value} points, no
 * dashboards-specific coupling) rather than a bespoke sparkline. TrendChart
 * itself renders "Not enough data yet." for fewer than 2 points, which
 * doubles as this chart's honest empty state before the first two window
 * ticks arrive.
 */
export function WindowedAggregateChart({ windows }: { windows: WindowAggregate[] }) {
  const points = windows.map((w) => ({ label: formatWindowTickLabel(w.windowEndedAt), value: w.messagesPerSecond }));

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <h3 className="os-font-mono m-0 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-subtle)' }}>
        Messages / sec
      </h3>
      <TrendChart points={points} color="accent" height={120} valueFormatter={(v) => `${v.toFixed(1)}/s`} />
    </Panel>
  );
}
