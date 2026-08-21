import { useState, type MouseEvent } from 'react';
import { ChartTooltip } from './ChartTooltip';
import { ZoomControls } from './ZoomControls';
import { useChartZoom } from './useChartZoom';
import { useThemeStore } from '@/app/theme-store';
import type { ChartVariant } from '@/shared/design-system';

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

/** Same grouping idea as BarMark: the Connections screen's chart-style
 * picker was designed for ConsoleBarChart's two-series bars, so on a
 * continuous single-series line these 11 options collapse to the handful
 * that read as genuinely different treatments (fill, stroke, line shape)
 * rather than being drawn identically for no reason. */
function trendTreatment(variant: ChartVariant) {
  switch (variant) {
    case 'grid':
    case 'paired':
    case 'ledger':
      return { area: 'none' as const, strokeWidth: 1.5, dash: undefined, step: false, dots: false };
    case 'block':
      return { area: 'gradient' as const, strokeWidth: 2.5, dash: undefined, step: true, dots: false };
    case 'ticks':
    case 'split':
      return { area: 'gradient' as const, strokeWidth: 2, dash: '5,4', step: false, dots: false };
    case 'lollipop':
      return { area: 'gradient' as const, strokeWidth: 2, dash: undefined, step: false, dots: true };
    case 'capsule':
      return { area: 'none' as const, strokeWidth: 4, dash: undefined, step: false, dots: false };
    case 'ghost':
      return { area: 'ghost' as const, strokeWidth: 1.5, dash: undefined, step: false, dots: false };
    case 'hatch':
      return { area: 'hatch' as const, strokeWidth: 2.5, dash: undefined, step: false, dots: false };
    case 'area':
    default:
      return { area: 'gradient' as const, strokeWidth: 2.5, dash: undefined, step: false, dots: false };
  }
}

/** Rewrites a straight-line point string into a step-after staircase
 * (block variant) -- each segment holds at the previous value until the
 * next x, rather than sloping directly to it. */
function toStepPoints(coords: readonly (readonly [number, number])[]): string {
  const out: string[] = [];
  coords.forEach(([x, y], i) => {
    if (i > 0) out.push(`${x},${coords[i - 1][1]}`);
    out.push(`${x},${y}`);
  });
  return out.join(' ');
}

const VIEWBOX_WIDTH = 560;

/** Maps the chart's semantic color prop to the design-system token that
 * actually carries that meaning post-redesign (brand/success/warning/danger). */
const COLOR_VAR: Record<NonNullable<TrendChartProps['color']>, string> = {
  accent: 'brand',
  good: 'success',
  warn: 'warning',
  crit: 'danger',
};

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
  const chartStyle = useThemeStore((s) => s.chartStyle);
  const treatment = trendTreatment(chartStyle);

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center text-[12px]" style={{ height, color: 'var(--text-subtle)' }}>
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

  const linePoints = treatment.step ? toStepPoints(coords) : coords.map(([x, y]) => `${x},${y}`).join(' ');
  const areaPoints = `${linePoints} ${VIEWBOX_WIDTH},${height} 0,${height}`;
  const [lastX, lastY] = coords[coords.length - 1];
  const gradientId = `trend-fill-${color}-${points.length}`;
  const hatchId = `trend-hatch-${color}-${points.length}`;
  const colorVar = COLOR_VAR[color];

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
              <stop offset="0%" stopColor={`var(--${colorVar})`} stopOpacity={treatment.area === 'ghost' ? 0.1 : 0.35} />
              <stop offset="100%" stopColor={`var(--${colorVar})`} stopOpacity={0} />
            </linearGradient>
            <pattern id={hatchId} patternUnits="userSpaceOnUse" width={4} height={4} patternTransform="rotate(-60)">
              <rect width={4} height={4} fill={`var(--${colorVar})`} opacity={0.12} />
              <line x1={0} y1={0} x2={0} y2={4} stroke={`var(--${colorVar})`} strokeWidth={1.4} />
            </pattern>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} y1={height * f} x2={VIEWBOX_WIDTH} y2={height * f} stroke="var(--border-subtle)" strokeWidth={1} />
          ))}
          {treatment.area !== 'none' && (
            <polygon points={areaPoints} fill={treatment.area === 'hatch' ? `url(#${hatchId})` : `url(#${gradientId})`} />
          )}
          <polyline
            points={linePoints}
            fill="none"
            stroke={`var(--${colorVar})`}
            strokeWidth={treatment.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin={treatment.step ? 'miter' : 'round'}
            strokeDasharray={treatment.dash}
          />
          {treatment.dots &&
            coords.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill={`var(--${colorVar})`} stroke="var(--canvas)" strokeWidth={1.5} />)}
          <circle cx={lastX} cy={lastY} r={4.5} fill={`var(--${colorVar})`} stroke="var(--canvas)" strokeWidth={2} />
          {hoverCoord && (
            <>
              <line x1={hoverCoord[0]} y1={0} x2={hoverCoord[0]} y2={height} stroke="var(--text-subtle)" strokeWidth={1} strokeDasharray="3,3" />
              <circle cx={hoverCoord[0]} cy={hoverCoord[1]} r={5.5} fill={`var(--${colorVar})`} stroke="var(--canvas)" strokeWidth={2} />
            </>
          )}
          {dragBand && (
            <rect
              x={dragBand[0]}
              y={0}
              width={Math.max(1, dragBand[1] - dragBand[0])}
              height={height}
              fill="var(--brand)"
              opacity={0.18}
              stroke="var(--brand)"
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
      <div className="os-font-mono mt-1.5 flex justify-between text-[10px]" style={{ color: 'var(--text-subtle)' }}>
        {labelIndices.map((i) => (
          <span key={i}>{displayPoints[i].label}</span>
        ))}
      </div>
      {valueFormatter && (
        <div className="os-font-mono mt-1 flex justify-between text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span>min {valueFormatter(min)}</span>
          <span>max {valueFormatter(max)}</span>
        </div>
      )}
    </div>
  );
}
