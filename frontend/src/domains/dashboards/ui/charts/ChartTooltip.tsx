interface ChartTooltipProps {
  /** Percent (0-100) position of the anchor point within the chart's
   * relatively-positioned wrapper -- the tooltip floats centered above it. */
  leftPct: number;
  topPct: number;
  label: string;
  value: string;
}

/** Shared floating tooltip for TrendChart/BarChart hover -- inverted
 * ink-on-bg chip, consistent across both chart types. */
export function ChartTooltip({ leftPct, topPct, label, value }: ChartTooltipProps) {
  return (
    <div
      className="os-font-mono pointer-events-none absolute z-10 whitespace-nowrap rounded-md px-2 py-1 text-[10.5px] shadow-lg"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: 'translate(-50%, calc(-100% - 8px))',
        background: 'var(--surface-inverse)',
        color: 'var(--text-on-inverse)',
      }}
    >
      <div style={{ opacity: 0.75 }}>{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
