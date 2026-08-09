type GaugeColor = 'accent' | 'good' | 'warn' | 'crit';

interface GaugeProps {
  /** 0-100 */
  value: number;
  label: string;
  sublabel: string;
  color?: GaugeColor;
}

const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Circular resource gauge (driver memory, shuffle load, CPU...). Pure
 * presentational -- callers own the polling/data-fetching, this only knows
 * how to render a 0-100 value. */
export function Gauge({ value, label, sublabel, color = 'accent' }: GaugeProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
        {label}
      </div>
      <svg width={120} height={120} viewBox="0 0 120 120">
        <circle cx={60} cy={60} r={RADIUS} fill="none" stroke="var(--shadow-lo)" strokeWidth={10} />
        <circle
          cx={60}
          cy={60}
          r={RADIUS}
          fill="none"
          stroke={`var(--${color})`}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
        <text x={60} y={56} textAnchor="middle" fontFamily="Big Shoulders" fontWeight={800} fontSize={22} fill="var(--ink)">
          {Math.round(clamped)}%
        </text>
        <text x={60} y={74} textAnchor="middle" fontFamily="Plex Mono" fontSize={10} fill="var(--ink-muted)">
          {sublabel}
        </text>
      </svg>
    </div>
  );
}
