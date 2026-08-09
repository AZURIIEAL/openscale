interface SparklineProps {
  /** Chronological series, oldest first. */
  values: number[];
  color?: 'accent' | 'good' | 'warn' | 'crit';
  height?: number;
}

const VIEWBOX_WIDTH = 420;

/** Small trend chart with gradient fill and an emphasized endpoint --
 * deliberately not a generic charting-library wrapper; this is for the
 * lightweight "how's this trending" cards (Home, Dashboards). Anything
 * needing real interactivity/zoom belongs in the dashboards domain's own
 * chart components instead of being bolted onto this primitive. */
export function Sparkline({ values, color = 'accent', height = 92 }: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padTop = height * 0.1;
  const usableHeight = height - padTop * 2;
  const step = VIEWBOX_WIDTH / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = padTop + usableHeight * (1 - (v - min) / range);
    return [x, y] as const;
  });

  const linePoints = points.map(([x, y]) => `${x},${y}`).join(' ');
  const areaPoints = `${linePoints} ${VIEWBOX_WIDTH},${height} 0,${height}`;
  const [lastX, lastY] = points[points.length - 1];
  const gradientId = `sparkline-fill-${color}`;

  return (
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
      <polyline
        points={linePoints}
        fill="none"
        stroke={`var(--${color})`}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={4.5} fill={`var(--${color})`} stroke="var(--bg)" strokeWidth={2} />
    </svg>
  );
}
