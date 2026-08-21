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
 * headline value beneath it (mirrors the artifact's chart-panel Cards). */
export function ChartPanel({ title, value, valueColor, children, className }: ChartPanelProps) {
  return (
    <Panel className={className}>
      <header>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-heading)' }}>{title}</h3>
      </header>
      {value && (
        <div
          className="os-tabular-nums"
          style={{ margin: '10px 0 14px', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: valueColor ?? 'var(--text-heading)' }}
        >
          {value}
        </div>
      )}
      <div className={value ? '' : 'mt-4'}>{children}</div>
    </Panel>
  );
}
