import { useState, type MouseEvent } from 'react';
import { ChartTooltip } from './ChartTooltip';
import { ZoomControls } from './ZoomControls';
import { useChartZoom } from './useChartZoom';
import { BarMark } from './BarMark';
import { useThemeStore } from '@/app/theme-store';

interface BarChartPoint {
  label: string;
  value: number;
}

interface BarChartProps {
  points: BarChartPoint[];
  color?: 'accent' | 'good' | 'warn' | 'crit';
  height?: number;
  valueFormatter?: (value: number) => string;
  /** Show every Nth label instead of all of them -- avoids crowding a
   * 24-hour axis. Defaults to showing every label. */
  labelStride?: number;
}

/** Maps the chart's semantic color prop to the design-system token that
 * actually carries that meaning post-redesign (brand/success/warning/danger). */
const COLOR_VAR: Record<NonNullable<BarChartProps['color']>, string> = {
  accent: 'brand',
  good: 'success',
  warn: 'warning',
  crit: 'danger',
};

/** Vertical bar chart, CSS flexbox rather than SVG (simpler for
 * evenly-spaced categorical data like hour-of-day), with a hover tooltip
 * and drag-to-zoom (same mechanics as TrendChart, see useChartZoom) --
 * same CSS-var color/hairline conventions as TrendChart/Sparkline. */
export function BarChart({ points, color = 'accent', height = 120, valueFormatter, labelStride = 1 }: BarChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const zoom = useChartZoom(points, (p) => p.label);
  const displayPoints = zoom.displayPoints;
  const chartStyle = useThemeStore((s) => s.chartStyle);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center text-[12px]" style={{ height, color: 'var(--text-subtle)' }}>
        Not enough data yet.
      </div>
    );
  }

  const colorVar = COLOR_VAR[color];
  const max = Math.max(...displayPoints.map((p) => p.value), 1);

  function indexAt(e: MouseEvent<HTMLDivElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(displayPoints.length - 1, Math.floor(relX * displayPoints.length)));
  }

  function handleMouseDown(e: MouseEvent<HTMLDivElement>) {
    zoom.startDrag(indexAt(e));
    setHoverIndex(null);
  }

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (zoom.isDragging) {
      zoom.updateDrag(indexAt(e));
    } else {
      setHoverIndex(indexAt(e));
    }
  }

  const hoverPoint = !zoom.isDragging && hoverIndex !== null ? displayPoints[hoverIndex] : null;
  const hoverBarHeightPct = hoverPoint ? Math.max(2, (hoverPoint.value / max) * 100) : 0;
  const dragBandPct = zoom.dragLocalRange
    ? [(zoom.dragLocalRange[0] / displayPoints.length) * 100, ((zoom.dragLocalRange[1] + 1) / displayPoints.length) * 100]
    : null;

  return (
    <div>
      {zoom.isZoomed && zoom.zoomLabel && <ZoomControls zoomLabel={zoom.zoomLabel} onReset={zoom.reset} />}
      <div className="relative flex items-end gap-[3px]" style={{ height }}>
        {displayPoints.map((p, i) => (
          <div key={i} className="relative flex-1" style={{ height: '100%', minWidth: 2 }}>
            <BarMark
              variant={chartStyle}
              colorVar={colorVar}
              pct={Math.max(2, (p.value / max) * 100)}
              dimmed={hoverIndex !== null && hoverIndex !== i}
              orientation="vertical"
            />
          </div>
        ))}
        {dragBandPct && (
          <div
            className="pointer-events-none absolute bottom-0 top-0"
            style={{
              left: `${dragBandPct[0]}%`,
              width: `${dragBandPct[1] - dragBandPct[0]}%`,
              background: 'var(--brand)',
              opacity: 0.18,
              border: '1px dashed var(--brand)',
            }}
          />
        )}
        {/* Transparent full-area hit target -- unifies hover and drag index
         * tracking across the whole bar row rather than per-bar handlers. */}
        <div
          className="absolute inset-0"
          style={{ cursor: zoom.isDragging ? 'ew-resize' : 'crosshair' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => !zoom.isDragging && setHoverIndex(null)}
        />
        {hoverPoint && (
          <ChartTooltip
            leftPct={((hoverIndex! + 0.5) / displayPoints.length) * 100}
            topPct={100 - hoverBarHeightPct}
            label={hoverPoint.label}
            value={valueFormatter ? valueFormatter(hoverPoint.value) : String(hoverPoint.value)}
          />
        )}
      </div>
      <div className="os-font-mono mt-1.5 flex text-[10px]" style={{ color: 'var(--text-subtle)' }}>
        {displayPoints.map((p, i) => (
          <span key={i} className="flex-1 truncate text-center">
            {i % labelStride === 0 ? p.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
