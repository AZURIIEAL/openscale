import { useState } from 'react';

interface HorizontalBarChartPoint {
  label: string;
  value: number;
}

interface HorizontalBarChartProps {
  points: HorizontalBarChartPoint[];
  color?: 'accent' | 'good' | 'warn' | 'crit';
  valueFormatter?: (value: number) => string;
}

/** Horizontal bar leaderboard -- top-N categorical data (e.g. zones by
 * trip volume), where labels need real width to read. Values are already
 * shown as text, so hover just highlights the row rather than adding a
 * floating tooltip. */
export function HorizontalBarChart({ points, color = 'accent', valueFormatter }: HorizontalBarChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-[12px]" style={{ color: 'var(--ink-faint)' }}>
        Not enough data yet.
      </div>
    );
  }

  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <div className="flex flex-col gap-1">
      {points.map((p, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 rounded-md px-1.5 py-0.5 transition-colors"
          style={{ background: hoverIndex === i ? 'var(--shadow-lo-soft)' : 'transparent', cursor: 'default' }}
          onMouseEnter={() => setHoverIndex(i)}
          onMouseLeave={() => setHoverIndex((current) => (current === i ? null : current))}
        >
          <span
            className="os-font-mono w-16 flex-shrink-0 text-[11px]"
            style={{ color: hoverIndex === i ? 'var(--ink)' : 'var(--ink-muted)' }}
          >
            {p.label}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded" style={{ background: 'var(--shadow-lo)' }}>
            <div
              className="h-full rounded transition-opacity"
              style={{
                width: `${Math.max(2, (p.value / max) * 100)}%`,
                background: `var(--${color})`,
                opacity: hoverIndex === null || hoverIndex === i ? 1 : 0.55,
              }}
            />
          </div>
          <span className="os-font-mono os-tabular-nums w-14 flex-shrink-0 text-right text-[11px]" style={{ color: 'var(--ink)' }}>
            {valueFormatter ? valueFormatter(p.value) : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
