import type { ChartVariant } from '@/shared/design-system';

interface ChartStyleOption {
  key: ChartVariant;
  label: string;
  hint: string;
}

const CHART_STYLES: ChartStyleOption[] = [
  { key: 'hatch', label: 'Hatched', hint: 'The console default — wide stacked bars with the ember hatch.' },
  { key: 'grid', label: 'Hairline grid', hint: 'Thin flat columns. The quietest option on dense screens.' },
  { key: 'paired', label: 'Grouped pairs', hint: 'Series side by side, for comparing rather than totalling.' },
  { key: 'lollipop', label: 'Lollipop', hint: 'Stem and dot — least ink per data point.' },
  { key: 'area', label: 'Stacked area', hint: 'Continuous shape when the trend matters more than the day.' },
  { key: 'block', label: 'Solid block', hint: 'Full-width columns, square corners. The loudest option.' },
  { key: 'split', label: 'Split baseline', hint: 'Primary up, secondary down from a shared line.' },
  { key: 'ticks', label: 'Segmented ticks', hint: 'Bars built from counted units instead of a fill.' },
  { key: 'capsule', label: 'Capsule track', hint: 'Each bar in its own ghost track, so headroom stays visible.' },
  { key: 'ledger', label: 'Horizontal ledger', hint: 'Ranked rows with values in line. Fewer points, more precision.' },
  { key: 'ghost', label: 'Ghost + cap', hint: 'Faint columns with an accent cap at the value.' },
];

const COLS = [
  [9, 7],
  [14, 5],
  [7, 10],
  [17, 4],
  [11, 8],
] as const;

/** 5-column sketch of each treatment, drawn from the live chart tokens --
 * ported from the mockup's `chartSketch()`. Purely a picker preview; the
 * real rendering is ConsoleBarChart. */
function ChartSketch({ variant }: { variant: ChartVariant }) {
  const P = 'var(--chart-primary)';
  const S = 'var(--chart-secondary)';
  const T = 'var(--border-subtle)';

  const rects: { key: string; x: number; y: number; w: number; h: number; fill: string; rx?: number }[] = [];
  COLS.forEach(([a, b], i) => {
    const x = 2 + i * 11.5;
    const t = a + b;
    if (variant === 'paired') {
      rects.push({ key: `a${i}`, x, y: 26 - a, w: 3.4, h: a, fill: P, rx: 1 });
      rects.push({ key: `b${i}`, x: x + 4.2, y: 26 - b, w: 3.4, h: b, fill: S, rx: 1 });
    } else if (variant === 'split') {
      rects.push({ key: `a${i}`, x, y: 13 - a * 0.5, w: 7, h: a * 0.5, fill: P, rx: 1 });
      rects.push({ key: `b${i}`, x, y: 14, w: 7, h: b * 0.5, fill: S, rx: 1 });
    } else if (variant === 'ticks') {
      for (let k = 0; k < 6; k++) {
        const on = k < Math.round((t / 24) * 6);
        const bot = k < Math.round((b / 24) * 6);
        rects.push({ key: `t${i}${k}`, x, y: 22 - k * 4, w: 7, h: 2.6, fill: bot ? S : on ? P : T, rx: 0.8 });
      }
    } else if (variant === 'capsule') {
      rects.push({ key: `k${i}`, x: x + 0.5, y: 2, w: 6, h: 24, fill: T, rx: 3 });
      rects.push({ key: `a${i}`, x: x + 0.5, y: 26 - t, w: 6, h: a, fill: P, rx: 3 });
      rects.push({ key: `b${i}`, x: x + 0.5, y: 26 - b, w: 6, h: b, fill: S, rx: 3 });
    } else if (variant === 'ghost') {
      rects.push({ key: `k${i}`, x: x + 0.5, y: 26 - t, w: 6, h: t, fill: T, rx: 1 });
      rects.push({ key: `a${i}`, x: x + 0.5, y: 26 - t, w: 6, h: 2.4, fill: P, rx: 1 });
    } else if (variant === 'block') {
      rects.push({ key: `a${i}`, x: x - 1, y: 26 - t, w: 11, h: a, fill: P });
      rects.push({ key: `b${i}`, x: x - 1, y: 26 - b, w: 11, h: b, fill: S });
    } else if (variant === 'grid') {
      rects.push({ key: `a${i}`, x: x + 2, y: 26 - t, w: 3, h: a, fill: P, rx: 1 });
      rects.push({ key: `b${i}`, x: x + 2, y: 26 - b, w: 3, h: b, fill: S, rx: 1 });
    } else if (variant === 'hatch') {
      rects.push({ key: `a${i}`, x, y: 26 - t, w: 7.5, h: a, fill: P, rx: 1.5 });
      rects.push({ key: `b${i}`, x, y: 26 - b, w: 7.5, h: b, fill: S, rx: 1.5 });
    }
  });

  let extra: React.ReactNode = null;
  if (variant === 'lollipop') {
    extra = (
      <>
        {COLS.map(([a, b], i) => {
          const x = 2 + i * 11.5;
          const t = a + b;
          return (
            <g key={i}>
              <rect x={x + 3} y={26 - t} width={1.2} height={t} fill={P} rx={1} />
              <circle cx={x + 3.6} cy={26 - t} r={2.2} fill={P} />
              <circle cx={x + 3.6} cy={25} r={1.7} fill={S} />
            </g>
          );
        })}
      </>
    );
  } else if (variant === 'area') {
    const pt = (pick: (a: number, b: number) => number) =>
      COLS.map(([a, b], i) => `${2 + i * 11.5 + 3},${26 - pick(a, b)}`).join(' ');
    const top = pt((a, b) => a + b);
    const bot = pt((_a, b) => b);
    extra = (
      <>
        <polygon points={`5,26 ${top} 51,26`} fill={P} opacity={0.2} />
        <polygon points={`5,26 ${bot} 51,26`} fill={S} opacity={0.5} />
        <polyline points={top} fill="none" stroke={P} strokeWidth={1.4} strokeLinejoin="round" />
      </>
    );
  } else if (variant === 'ledger') {
    extra = (
      <>
        {[
          [16, 8],
          [12, 6],
          [20, 5],
        ].map(([a, b], i) => {
          const y = 5 + i * 8;
          return (
            <g key={i}>
              <rect x={2} y={y} width={54} height={4} fill={T} rx={2} />
              <rect x={2} y={y} width={a * 1.6} height={4} fill={P} rx={2} />
              <rect x={2 + a * 1.6} y={y} width={b * 1.2} height={4} fill={S} rx={2} />
            </g>
          );
        })}
      </>
    );
  }

  return (
    <svg viewBox="0 0 58 28" style={{ width: '100%', height: 36, display: 'block' }}>
      {rects.map((r) => (
        <rect key={r.key} x={r.x} y={r.y} width={r.w} height={Math.max(r.h, 0.5)} fill={r.fill} rx={r.rx || 0} />
      ))}
      {extra}
      <rect x={0} y={26.6} width={58} height={0.8} fill={T} />
    </svg>
  );
}

interface ChartStylePickerProps {
  value: ChartVariant;
  onChange: (variant: ChartVariant) => void;
}

/** 11-option chart-plot-style picker for the Connections screen -- applies
 * to every ConsoleBarChart on Home and Dashboards. */
export function ChartStylePicker({ value, onChange }: ChartStylePickerProps) {
  const active = CHART_STYLES.find((c) => c.key === value) ?? CHART_STYLES[0];
  return (
    <div>
      <div role="radiogroup" aria-label="Chart style" className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))' }}>
        {CHART_STYLES.map((cs) => {
          const selected = cs.key === value;
          return (
            <button
              key={cs.key}
              type="button"
              role="radio"
              aria-checked={selected}
              title={cs.label}
              onClick={() => onChange(cs.key)}
              className="flex flex-col items-stretch gap-2 rounded-2xl p-2.5 text-left transition-transform active:scale-[0.97]"
              style={{
                background: selected ? 'var(--surface-sunken)' : 'var(--surface-card)',
                border: selected ? '1px solid var(--brand)' : '1px solid var(--border-subtle)',
                boxShadow: selected ? '0 0 0 3px var(--ring-tint)' : 'none',
              }}
            >
              <ChartSketch variant={cs.key} />
              <span
                className="truncate"
                style={{ fontSize: 12, fontWeight: selected ? 700 : 600, color: selected ? 'var(--text-heading)' : 'var(--text-muted)' }}
              >
                {cs.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-wrap-pretty" style={{ margin: '16px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
        {active.label} — {active.hint}
      </p>
    </div>
  );
}
