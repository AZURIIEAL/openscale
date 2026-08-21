import type { CSSProperties } from 'react';
import type { ChartVariant } from '@/shared/design-system';
import type { ResourceGauge } from '../domain/entities';

const COLOR_VAR: Record<ResourceGauge['color'], string> = {
  accent: 'brand',
  good: 'success',
  warn: 'warning',
  crit: 'danger',
};

/** Tight variant layouts (ticks/ledger/ghost) use a fixed-width label
 * column sized for the mockup's short "Memory"/"CPU" labels -- strip the
 * "Container " prefix so the real (longer) gauge.label still fits. */
function shortLabel(label: string): string {
  return label.replace(/^Container /, '');
}

const box: CSSProperties = { background: 'var(--surface-sunken)', borderRadius: 16, padding: 16 };
const trackBg = 'var(--ink-100)';
/** `trackBg` reads fine as a continuous bar's backdrop, but discrete marks
 * (tick pips, the ghost ring) need to read as individually visible shapes
 * -- against the sunken card background the two tokens are only 5 units
 * apart in lightness (#F2F2F2 on #F7F7F7), which made "off" ticks
 * disappear instead of reading as a dim track. */
const markTrackBg = 'var(--border-default)';

interface MetersProps {
  gauges: ResourceGauge[];
}

interface ContainerLoadMetersProps extends MetersProps {
  /** Connections screen's chart-style picker -- ported from the "Chart &
   * meter variations" design doc, which pairs each of the 10 chart plot
   * treatments with a matching Container Load meter treatment (`hatch`,
   * the console default, keeps the plain single-bar meter below since the
   * doc doesn't cover it). */
  variant: ChartVariant;
}

/**
 * Container Load's Memory/CPU meters, restyled to match whichever chart
 * plot treatment is selected in Connections -- same idea as charts/BarMark
 * for Dashboards, but for this app's one other place a "chart style" shows
 * up outside ConsoleBarChart itself.
 */
export function ContainerLoadMeters({ gauges, variant }: ContainerLoadMetersProps) {
  switch (variant) {
    case 'grid':
      return <GridMeters gauges={gauges} />;
    case 'paired':
      return <PairedMeters gauges={gauges} />;
    case 'lollipop':
      return <LollipopMeters gauges={gauges} />;
    case 'area':
      return <AreaMeters gauges={gauges} />;
    case 'block':
      return <BlockMeters gauges={gauges} />;
    case 'split':
      return <SplitMeters gauges={gauges} />;
    case 'ticks':
      return <TicksMeters gauges={gauges} />;
    case 'capsule':
      return <CapsuleMeters gauges={gauges} />;
    case 'ledger':
      return <LedgerMeters gauges={gauges} />;
    case 'ghost':
      return <GhostMeters gauges={gauges} />;
    case 'hatch':
    default:
      return <DefaultMeters gauges={gauges} />;
  }
}

/** hatch (console default): the original plain meter -- thin track, full
 * fill, "used / total" caption underneath. */
function DefaultMeters({ gauges }: MetersProps) {
  return (
    <div className="flex flex-col gap-4">
      {gauges.map((g) => (
        <div key={g.id} style={box}>
          <div className="flex items-baseline justify-between">
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{g.label}</span>
            <span className="os-tabular-nums" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {Math.round(g.valuePercent)}%
            </span>
          </div>
          <div className="mt-3" style={{ position: 'relative', height: 10, borderRadius: 999, overflow: 'hidden', background: trackBg, boxShadow: 'var(--shadow-inset-track)' }}>
            <div
              style={{
                position: 'absolute',
                inset: '0 auto 0 0',
                width: `${g.valuePercent}%`,
                borderRadius: 999,
                background: `var(--${COLOR_VAR[g.color]})`,
                transition: 'width var(--dur-slow) var(--ease-out)',
              }}
            />
          </div>
          <div className="os-tabular-nums mt-2.5 flex justify-between" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            <span>{g.usedLabel} used</span>
            <span style={{ fontWeight: 700, color: 'var(--text-body)' }}>{g.totalLabel}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** grid (1a): thinner 4px bar, no caption -- the quietest option. */
function GridMeters({ gauges }: MetersProps) {
  return (
    <div className="flex flex-col gap-3" style={box}>
      {gauges.map((g) => (
        <div key={g.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{g.label}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-heading)' }}>{Math.round(g.valuePercent)}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: trackBg }}>
            <div style={{ width: `${g.valuePercent}%`, height: '100%', borderRadius: 999, background: `var(--${COLOR_VAR[g.color]})`, transition: 'width var(--dur-slow) var(--ease-out)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** paired (1b): value fill and a separate remainder pill, 3px gap between
 * them -- reads as two bars rather than one bar with headroom. */
function PairedMeters({ gauges }: MetersProps) {
  return (
    <div className="flex flex-col gap-3" style={box}>
      {gauges.map((g) => (
        <div key={g.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{g.label}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-heading)' }}>{Math.round(g.valuePercent)}%</span>
          </div>
          <div className="flex" style={{ gap: 3, height: 8 }}>
            <div style={{ width: `${g.valuePercent}%`, borderRadius: 999, background: `var(--${COLOR_VAR[g.color]})` }} />
            <div style={{ flex: 1, borderRadius: 999, background: trackBg }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** lollipop (1c): thin track with a single dot marker at the value. */
function LollipopMeters({ gauges }: MetersProps) {
  return (
    <div className="flex flex-col gap-3.5" style={box}>
      {gauges.map((g) => (
        <div key={g.id} className="flex items-center" style={{ gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', width: 56, flexShrink: 0 }}>{shortLabel(g.label)}</span>
          <div style={{ flex: 1, height: 2, background: trackBg, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: `${g.valuePercent}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 10,
                height: 10,
                borderRadius: 999,
                background: `var(--${COLOR_VAR[g.color]})`,
                transition: 'left var(--dur-slow) var(--ease-out)',
              }}
            />
          </div>
          <span className="os-tabular-nums" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-heading)', width: 36, flexShrink: 0, textAlign: 'right' }}>
            {Math.round(g.valuePercent)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/** area (1d): fill plus a tick "marker" cap standing above the bar. */
function AreaMeters({ gauges }: MetersProps) {
  return (
    <div className="flex flex-col gap-3" style={box}>
      {gauges.map((g) => (
        <div key={g.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{g.label}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-heading)' }}>{Math.round(g.valuePercent)}%</span>
          </div>
          <div style={{ height: 6, background: trackBg, position: 'relative' }}>
            <div style={{ width: `${g.valuePercent}%`, height: '100%', background: `var(--${COLOR_VAR[g.color]})` }} />
            <div
              style={{
                position: 'absolute',
                left: `${g.valuePercent}%`,
                top: -4,
                width: 2,
                height: 14,
                background: 'var(--text-heading)',
                transition: 'left var(--dur-slow) var(--ease-out)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** block (1e): each gauge as its own mini card, side by side. */
function BlockMeters({ gauges }: MetersProps) {
  return (
    <div className="flex" style={{ gap: 10 }}>
      {gauges.map((g) => (
        <div key={g.id} className="flex flex-1 flex-col gap-2" style={{ background: 'var(--surface-sunken)', borderRadius: 12, padding: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{shortLabel(g.label)}</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-heading)' }}>{Math.round(g.valuePercent)}%</span>
          <div className="flex" style={{ gap: 2, height: 10 }}>
            <div style={{ width: `${g.valuePercent}%`, background: `var(--${COLOR_VAR[g.color]})` }} />
            <div style={{ flex: 1, background: trackBg }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** split (1f): fill centered in a pill track, echoing the chart's shared
 * baseline instead of a left-anchored bar. */
function SplitMeters({ gauges }: MetersProps) {
  return (
    <div className="flex flex-col gap-3" style={box}>
      {gauges.map((g) => (
        <div key={g.id} className="flex items-center" style={{ gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', width: 56, flexShrink: 0 }}>{shortLabel(g.label)}</span>
          <div className="flex justify-center" style={{ flex: 1, height: 10, borderRadius: 999, background: trackBg }}>
            <div style={{ width: `${g.valuePercent}%`, height: '100%', borderRadius: 999, background: `var(--${COLOR_VAR[g.color]})` }} />
          </div>
          <span className="os-tabular-nums" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-heading)', width: 36, flexShrink: 0, textAlign: 'right' }}>
            {Math.round(g.valuePercent)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/** ticks (1g): 20 counted "pip" segments instead of a continuous fill. */
function TicksMeters({ gauges }: MetersProps) {
  const N = 20;
  return (
    <div className="flex flex-col gap-3" style={box}>
      {gauges.map((g) => {
        const on = Math.round((g.valuePercent / 100) * N);
        return (
          <div key={g.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{g.label}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-heading)' }}>{Math.round(g.valuePercent)}%</span>
            </div>
            <div className="flex" style={{ gap: 3, height: 8 }}>
              {Array.from({ length: N }, (_, i) => (
                <div key={i} style={{ flex: 1, borderRadius: 2, background: i < on ? `var(--${COLOR_VAR[g.color]})` : markTrackBg }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** capsule (1h): padded pill track (the fill sits inset in its own
 * "capsule"), plus the used/total caption -- closest to the original
 * console default, just with visible headroom around the fill. */
function CapsuleMeters({ gauges }: MetersProps) {
  return (
    <div className="flex flex-col gap-4" style={box}>
      {gauges.map((g) => (
        <div key={g.id} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{g.label}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-heading)' }}>{Math.round(g.valuePercent)}%</span>
          </div>
          <div style={{ height: 14, borderRadius: 999, background: trackBg, padding: 3, boxSizing: 'border-box' }}>
            <div style={{ width: `${g.valuePercent}%`, height: '100%', borderRadius: 999, background: `var(--${COLOR_VAR[g.color]})`, transition: 'width var(--dur-slow) var(--ease-out)' }} />
          </div>
          <div className="os-tabular-nums flex justify-between" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)' }}>
            <span>{g.usedLabel} used</span>
            <span style={{ color: 'var(--text-heading)' }}>{g.totalLabel}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** ledger (1i): ranked-row layout -- label, thin pill, raw used value in
 * line (no percent), matching the chart's ledger rows. */
function LedgerMeters({ gauges }: MetersProps) {
  return (
    <div className="flex flex-col gap-2.5" style={box}>
      {gauges.map((g) => (
        <div key={g.id} className="flex items-center" style={{ gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 52, flexShrink: 0 }}>{shortLabel(g.label)}</span>
          <div style={{ flex: 1, height: 12, borderRadius: 999, background: trackBg }}>
            <div style={{ width: `${g.valuePercent}%`, height: '100%', borderRadius: 999, background: `var(--${COLOR_VAR[g.color]})`, transition: 'width var(--dur-slow) var(--ease-out)' }} />
          </div>
          <span className="os-tabular-nums" style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-heading)', width: 64, flexShrink: 0, textAlign: 'right' }}>
            {g.usedLabel}
          </span>
        </div>
      ))}
    </div>
  );
}

/** ghost (1j): radial ring gauges instead of linear bars. */
function GhostMeters({ gauges }: MetersProps) {
  return (
    <div className="flex" style={{ gap: 14, ...box }}>
      {gauges.map((g) => {
        const pct = Math.max(0, Math.min(100, g.valuePercent));
        return (
          <div key={g.id} className="flex flex-1 items-center" style={{ gap: 12 }}>
            <svg viewBox="0 0 36 36" style={{ width: 52, height: 52, flexShrink: 0 }}>
              <circle cx={18} cy={18} r={15.5} fill="none" stroke={markTrackBg} strokeWidth={5} />
              <circle
                cx={18}
                cy={18}
                r={15.5}
                fill="none"
                stroke={`var(--${COLOR_VAR[g.color]})`}
                strokeWidth={5}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={`${pct} ${100 - pct}`}
                transform="rotate(-90 18 18)"
                style={{ transition: 'stroke-dasharray var(--dur-slow) var(--ease-out)' }}
              />
            </svg>
            <div className="flex flex-col" style={{ gap: 3 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-heading)' }}>{Math.round(g.valuePercent)}%</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{shortLabel(g.label)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
