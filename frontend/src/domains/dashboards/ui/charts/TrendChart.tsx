import { useState, type MouseEvent } from 'react';
import { ChartTooltip } from './ChartTooltip';
import { ZoomControls } from './ZoomControls';
import { useChartZoom } from './useChartZoom';

interface TrendChartPoint {
  label: string;
  value: number;
}

interface TrendChartProps {
  points: TrendChartPoint[];
  color?: 'accent' | 'good' | 'warn' | 'crit';
  height?: number;
  valueFormatter?: (value: number) => string;
}

const VIEWBOX_WIDTH = 560;

/** Line+area trend chart with date/hour axis labels, a hover tooltip, and
 * drag-to-zoom (drag across the chart to select a range, rescaling both
 * axes to it; "Reset zoom" returns to the full series) -- same hand-rolled
 * SVG approach as shared/design-system/Sparkline, generalized for
 * {label, value} points, a labeled x-axis, and pointer interaction.
 * Dashboards-domain-owned rather than bolted onto Sparkline, per that
 * component's own comment pointing here for anything needing more than a
 * bare trend line. */
export function TrendChart({ points, color = 'accent', height = 120, valueFormatter }: TrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const zoom = useChartZoom(points, (p) => p.label);
  const displayPoints = zoom.displayPoints;

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center text-[12px]" style={{ height, color: 'var(--ink-faint)' }}>
        Not enough data yet.
      </div>
    );
  }

  const values = displayPoints.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padTop = height * 0.12;
  const usableHeight = height - padTop * 2;
  const step = displayPoints.length > 1 ? VIEWBOX_WIDTH / (displayPoints.length - 1) : VIEWBOX_WIDTH;

  const coords = displayPoints.map((p, i) => {
    const x = i * step;
    const y = padTop + usableHeight * (1 - (p.value - min) / range);
    return [x, y] as const;
  });

  const linePoints = coords.map(([x, y]) => `${x},${y}`).join(' ');
  const areaPoints = `${linePoints} ${VIEWBOX_WIDTH},${height} 0,${height}`;
  const [lastX, lastY] = coords[coords.length - 1];
  const gradientId = `trend-fill-${color}-${points.length}`;

  // Avoid crowding the axis: at most 6 labels, evenly spaced, always
  // including the first and last point.
  const labelCount = Math.min(6, displayPoints.length);
  const labelIndices = Array.from({ length: labelCount }, (_, i) =>
    Math.round((i * (displayPoints.length - 1)) / (labelCount - 1)),
  );

  function indexAt(e: MouseEvent<SVGRectElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(displayPoints.length - 1, Math.round(relX * (displayPoints.length - 1))));
  }

  function handleMouseDown(e: MouseEvent<SVGRectElement>) {
    zoom.startDrag(indexAt(e));
    setHoverIndex(null);
  }

  function handleMouseMove(e: MouseEvent<SVGRectElement>) {
    if (zoom.isDragging) {
      zoom.updateDrag(indexAt(e));
    } else {
      setHoverIndex(indexAt(e));
    }
  }

  const hoverCoord = !zoom.isDragging && hoverIndex !== null ? coords[hoverIndex] : null;
  const hoverPoint = !zoom.isDragging && hoverIndex !== null ? displayPoints[hoverIndex] : null;
  const dragBand = zoom.dragLocalRange ? [coords[zoom.dragLocalRange[0]][0], coords[zoom.dragLocalRange[1]][0]] : null;

  return (
    <div>
      {zoom.isZoomed && zoom.zoomLabel && <ZoomControls zoomLabel={zoom.zoomLabel} onReset={zoom.reset} />}
      <div className="relative">
        <svg width="100%" height={height} viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(--${color})`} stopOpacity={0.35} />
              <stop offset="100%" stopColor={`var(--${color})`} stopOpacity={0} />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} y1={height * f} x2={VIEWBOX_WIDTH} y2={height * f} stroke="var(--hairline)" strokeWidth={1} />
          ))}
          <polygon points={areaPoints} fill={`url(#${gradientId})`} />
          <polyline points={linePoints} fill="none" stroke={`var(--${color})`} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={lastX} cy={lastY} r={4.5} fill={`var(--${color})`} stroke="var(--bg)" strokeWidth={2} />
          {hoverCoord && (
            <>
              <line x1={hoverCoord[0]} y1={0} x2={hoverCoord[0]} y2={height} stroke="var(--ink-faint)" strokeWidth={1} strokeDasharray="3,3" />
              <circle cx={hoverCoord[0]} cy={hoverCoord[1]} r={5.5} fill={`var(--${color})`} stroke="var(--bg)" strokeWidth={2} />
            </>
          )}
          {dragBand && (
            <rect
              x={dragBand[0]}
              y={0}
              width={Math.max(1, dragBand[1] - dragBand[0])}
              height={height}
              fill="var(--accent)"
              opacity={0.18}
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="2,2"
            />
          )}
          {/* Transparent full-canvas hit target -- the line/area shapes above
           * don't cover empty space, so hover/drag tracking needs its own layer. */}
          <rect
            x={0}
            y={0}
            width={VIEWBOX_WIDTH}
            height={height}
            fill="transparent"
            style={{ cursor: zoom.isDragging ? 'ew-resize' : 'crosshair' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => !zoom.isDragging && setHoverIndex(null)}
          />
        </svg>
        {hoverCoord && hoverPoint && (
          <ChartTooltip
            leftPct={(hoverCoord[0] / VIEWBOX_WIDTH) * 100}
            topPct={(hoverCoord[1] / height) * 100}
            label={hoverPoint.label}
            value={valueFormatter ? valueFormatter(hoverPoint.value) : String(hoverPoint.value)}
          />
        )}
      </div>
      <div className="os-font-mono mt-1.5 flex justify-between text-[10px]" style={{ color: 'var(--ink-faint)' }}>
        {labelIndices.map((i) => (
          <span key={i}>{displayPoints[i].label}</span>
        ))}
      </div>
      {valueFormatter && (
        <div className="os-font-mono mt-1 flex justify-between text-[10px]" style={{ color: 'var(--ink-muted)' }}>
          <span>min {valueFormatter(min)}</span>
          <span>max {valueFormatter(max)}</span>
        </div>
      )}
    </div>
  );
}
