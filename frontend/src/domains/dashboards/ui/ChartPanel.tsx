import type { ReactNode } from 'react';
import { Panel } from '@/shared/design-system/Panel';

interface ChartPanelProps {
  title: string;
  value?: string;
  valueColor?: string;
  children: ReactNode;
  className?: string;
}

/** Shared tile shell for every Dashboards chart -- title + optional
 * headline value on the right (mirrors GaugeRow's revenue-trend panel). */
export function ChartPanel({ title, value, valueColor, children, className }: ChartPanelProps) {
  return (
    <Panel className={`flex flex-col gap-2.5 px-5 py-[18px] ${className ?? ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
          {title}
        </span>
        {value && (
          <span className="os-font-display os-tabular-nums text-[18px]" style={valueColor ? { color: valueColor } : undefined}>
            {value}
          </span>
        )}
      </div>
      {children}
    </Panel>
  );
}
