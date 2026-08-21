import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

export interface ConsoleBarDatum {
  label: string;
  a: number;
  b: number;
}

export type ChartVariant =
  | 'hatch'
  | 'grid'
  | 'paired'
  | 'lollipop'
  | 'area'
  | 'block'
  | 'split'
  | 'ticks'
  | 'capsule'
  | 'ledger'
  | 'ghost';

interface ConsoleBarChartProps {
  data: ConsoleBarDatum[];
  seriesLabels?: [string, string];
  max?: number;
  ticks?: number;
  height?: number;
  variant?: ChartVariant;
  formatTick?: (n: number) => string;
  style?: CSSProperties;
}

const defaultFormatTick = (n: number) => (n >= 1000 ? `${n / 1000}k` : String(Math.round(n)).padStart(2, '0'));

/**
 * Two-series stacked/paired chart with eleven plot treatments, selectable
 * from the Connections screen's "Chart style" picker and applied wherever
 * this component is used (currently just Home's Daily Revenue -- Dashboards
 * keeps its own interactive BarChart/HorizontalBarChart/TrendChart, which
 * read the same `chartStyle` but translate it through charts/BarMark and
 * TrendChart's trendTreatment instead of rendering this component, so their
 * hover-tooltip and drag-to-zoom behavior survives).
 * Ported from the redesign mockup's `ConsoleBarChart.jsx` -- same geometry,
 * translated from inline React.createElement calls into JSX/CSS variables.
 */
export function ConsoleBarChart({
  data,
  seriesLabels = ['Series A', 'Series B'],
  max,
  ticks = 5,
  height = 220,
  variant = 'hatch',
  formatTick = defaultFormatTick,
  style,
}: ConsoleBarChartProps) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 40);
    return () => clearTimeout(t);
  }, []);

  // `split` and `paired` exist to contrast two real series (a vs. b) --
  // callers with only one series (b === 0 everywhere, e.g. Home's Daily
  // Revenue, which has no second series to show) get a broken-looking
  // chart from them otherwise: `split` mirrors the axis around a zero that
  // isn't meaningful and leaves the bars confined to (and shorter than) the
  // upper half, `paired` draws a visible bar next to an invisible empty
  // one. Falling back to their closest single-series treatment keeps every
  // variant looking intentional regardless of what data flows through it.
  const singleSeries = data.every((d) => d.b === 0);
  const effectiveVariant = variant === 'split' && singleSeries ? 'block' : variant === 'paired' && singleSeries ? 'grid' : variant;

  const ceiling = max || Math.max(...data.map((d) => d.a + d.b), 1);
  const tickValues = Array.from({ length: ticks }, (_, i) => Math.round((ceiling / ticks) * (ticks - i)));
  const mirrored = effectiveVariant === 'split';
  const half = ceiling / 2;
  const axisValues = mirrored ? [half, half / 2, 0, half / 2, half].map((n) => Math.round(n)) : tickValues;

  const HATCH = 'repeating-linear-gradient(-60deg, var(--ember-500) 0 1px, var(--ember-400) 1px 3px)';
  const P = effectiveVariant === 'hatch' ? HATCH : 'var(--chart-primary)';
  const plated = effectiveVariant === 'hatch' || effectiveVariant === 'grid' || effectiveVariant === 'block';
  const platePad = plated ? 12 : 0;
  const S = 'var(--chart-secondary)';
  const TRACK = 'var(--surface-sunken)';
  const R = 'var(--radius-sm)';
  const GROW = 'height var(--dur-slow) var(--ease-out)';
  const g = (v: number) => (grown ? v : 0);
  const pc = (n: number) => `${g((n / ceiling) * 100)}%`;

  const legend = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 12, fontSize: 14, fontWeight: 500, color: 'var(--text-body)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: P }} />
        {seriesLabels[0]}
      </span>
      {seriesLabels[1] && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: S }} />
          {seriesLabels[1]}
        </span>
      )}
    </div>
  );

  if (variant === 'ledger') {
    const rows = data.slice(-8);
    return (
      <div style={{ fontFamily: 'var(--font-core)', ...style }}>
        {legend}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: height }}>
          {rows.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 58, flex: 'none', fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {d.label}
              </span>
              <div style={{ flex: 1, height: 12, borderRadius: 999, background: TRACK, display: 'flex', overflow: 'hidden' }}>
                <div style={{ width: pc(d.a), background: P, transition: 'width var(--dur-slow) var(--ease-out)' }} />
                <div style={{ width: pc(d.b), background: S, transition: 'width var(--dur-slow) var(--ease-out)' }} />
              </div>
              <span className="os-tabular-nums" style={{ width: 46, flex: 'none', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>
                {formatTick(Math.round(d.a + d.b))}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const plot = (d: ConsoleBarDatum) => {
    const total = ((d.a + d.b) / ceiling) * 100;
    const topOf = (d.a / (d.a + d.b || 1)) * 100;
    const botOf = 100 - topOf;

    if (effectiveVariant === 'paired') {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, width: '100%' }}>
          <div style={{ width: 'min(9px, 26%)', height: pc(d.a), background: P, borderRadius: `${R} ${R} 0 0`, transition: GROW }} />
          <div style={{ width: 'min(9px, 26%)', height: pc(d.b), background: S, borderRadius: `${R} ${R} 0 0`, transition: GROW }} />
        </div>
      );
    }
    if (effectiveVariant === 'lollipop') {
      return (
        <div style={{ flex: 1, position: 'relative', width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', bottom: 0, width: 2, height: '100%', background: 'var(--chart-grid)', borderRadius: 2 }} />
          <div style={{ position: 'relative', width: 2, height: pc(d.a + d.b), background: P, borderRadius: 2, transition: GROW }}>
            <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 9, height: 9, borderRadius: 999, background: P }} />
            <div style={{ position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%)', width: 7, height: 7, borderRadius: 999, background: S }} />
          </div>
        </div>
      );
    }
    if (effectiveVariant === 'split') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div style={{ width: 'min(14px, 62%)', height: `${g((d.a / ceiling) * 200)}%`, maxHeight: '100%', background: P, borderRadius: `${R} ${R} 0 0`, transition: GROW }} />
          </div>
          <div style={{ height: 1, background: 'var(--border-default)' }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            <div style={{ width: 'min(14px, 62%)', height: `${g((d.b / ceiling) * 200)}%`, maxHeight: '100%', background: S, borderRadius: `0 0 ${R} ${R}`, transition: GROW }} />
          </div>
        </div>
      );
    }
    if (effectiveVariant === 'ticks') {
      const N = 10;
      const on = Math.round(((d.a + d.b) / ceiling) * N);
      const bot = Math.round((d.b / ceiling) * N);
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', gap: 3, width: 'min(20px, 74%)' }}>
          {Array.from({ length: N }, (_, k) => (
            <div key={k} style={{ flex: 1, borderRadius: 2, background: k < bot ? S : k < on ? P : 'var(--chart-grid)', transition: 'background var(--dur-base) var(--ease-standard)' }} />
          ))}
        </div>
      );
    }
    if (effectiveVariant === 'capsule') {
      return (
        <div style={{ flex: 1, width: 'min(20px, 74%)', borderRadius: 999, background: TRACK, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' }}>
          <div style={{ height: pc(d.a + d.b), borderRadius: 999, overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: GROW }}>
            <div style={{ height: `${topOf}%`, background: P }} />
            <div style={{ height: `${botOf}%`, background: S }} />
          </div>
        </div>
      );
    }
    if (effectiveVariant === 'ghost') {
      return (
        <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ width: 'min(24px, 78%)', height: pc(d.a + d.b), background: TRACK, borderRadius: `${R} ${R} 0 0`, overflow: 'hidden', transition: GROW }}>
            <div style={{ height: 6, background: 'var(--chart-primary)' }} />
          </div>
        </div>
      );
    }

    const w = effectiveVariant === 'block' ? '100%' : effectiveVariant === 'grid' ? 'min(12px, 52%)' : 'min(28px, 80%)';
    const rad = effectiveVariant === 'block' ? 0 : R;
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: w, height: pc(d.a + d.b), borderRadius: rad, overflow: 'hidden', background: P, transition: GROW }}>
          <div style={{ position: 'absolute', inset: 'auto 0 0 0', height: `${botOf}%`, background: S, borderRadius: rad }} />
        </div>
        <span style={{ display: 'none' }}>{total}</span>
      </div>
    );
  };

  const areaPlot = () => {
    const n = Math.max(data.length - 1, 1);
    const pts = (pick: (d: ConsoleBarDatum) => number) =>
      data.map((d, i) => `${((i / n) * 100).toFixed(2)},${(100 - g((pick(d) / ceiling) * 100)).toFixed(2)}`).join(' ');
    const top = pts((d) => d.a + d.b);
    const bot = pts((d) => d.b);
    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: '0 0 26px 0', width: '100%', height: 'calc(100% - 26px)', transition: 'opacity var(--dur-slow) var(--ease-out)', opacity: grown ? 1 : 0 }}
      >
        <polygon points={`0,100 ${top} 100,100`} fill="var(--chart-primary)" opacity="0.18" />
        <polygon points={`0,100 ${bot} 100,100`} fill="var(--chart-secondary)" opacity="0.45" />
        <polyline points={top} fill="none" stroke="var(--chart-primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <polyline points={bot} fill="none" stroke="var(--chart-secondary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
    );
  };

  const gap = effectiveVariant === 'block' ? 2 : 6;

  return (
    <div style={{ fontFamily: 'var(--font-core)', ...style }}>
      {legend}
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="os-tabular-nums" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height, paddingBottom: 26, fontSize: 13, color: 'var(--text-subtle)' }}>
          {axisValues.map((t, i) => (
            <span key={i}>{formatTick(t)}</span>
          ))}
          {!mirrored && <span>00</span>}
        </div>
        <div style={{ position: 'relative', flex: 1, height, minWidth: 0 }}>
          {plated && <div style={{ position: 'absolute', inset: '0 0 26px 0', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-lg)' }} />}
          <div style={{ position: 'absolute', inset: '0 0 26px 0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {axisValues.map((_t, i) => (
              <span key={i} style={{ borderTop: '1px dashed var(--chart-grid)' }} />
            ))}
            {!mirrored && <span style={{ borderTop: '1px dashed var(--chart-grid)' }} />}
          </div>
          {variant === 'area' && areaPlot()}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap, paddingLeft: platePad, paddingRight: platePad, boxSizing: 'border-box' }}>
            {data.map((d, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, height: '100%' }}>
                {variant === 'area' ? <div style={{ flex: 1 }} /> : plot(d)}
                <span style={{ height: 18, fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
