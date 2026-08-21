import type { ChartVariant } from '@/shared/design-system';

interface BarMarkProps {
  variant: ChartVariant;
  colorVar: string;
  /** 0-100, how full the bar/track is. */
  pct: number;
  dimmed?: boolean;
  orientation: 'vertical' | 'horizontal';
}

/** Groups the Connections screen's 11 chart-style variants down to the
 * handful that read as genuinely distinct on a single-series bar (unlike
 * ConsoleBarChart's two-series mockup charts, Dashboards' real data is one
 * series) -- the paired/split/ledger treatments exist to contrast two
 * series, so on a single series they fall back to their closest one-series
 * cousin instead of being drawn identically to `hatch` for no reason. */
function resolveVariant(variant: ChartVariant): 'hatch' | 'grid' | 'block' | 'ghost' | 'capsule' | 'ticks' | 'lollipop' {
  switch (variant) {
    case 'grid':
    case 'paired':
    case 'ledger':
      return 'grid';
    case 'block':
    case 'split':
    case 'area':
      return 'block';
    case 'ghost':
      return 'ghost';
    case 'capsule':
      return 'capsule';
    case 'ticks':
      return 'ticks';
    case 'lollipop':
      return 'lollipop';
    case 'hatch':
    default:
      return 'hatch';
  }
}

/**
 * Renders a single bar/track mark for Dashboards' interactive BarChart and
 * HorizontalBarChart. Unlike the static ConsoleBarChart used on Home, these
 * keep their own hover-tooltip and drag-to-zoom behavior -- this component
 * only decides how the mark *looks*, driven by the Connections screen's
 * chart-style picker (see theme-store's `chartStyle`), never the
 * interaction logic in the chart components that render it.
 */
export function BarMark({ variant, colorVar, pct, dimmed, orientation }: BarMarkProps) {
  const resolved = resolveVariant(variant);
  const color = `var(--${colorVar})`;
  const opacity = dimmed ? 0.45 : 1;
  const fillPct = `${Math.max(pct, 1.5)}%`;
  const v = orientation === 'vertical';

  if (resolved === 'hatch') {
    return (
      <div
        style={{
          position: 'absolute',
          ...(v ? { bottom: 0, left: 0, right: 0, height: fillPct } : { left: 0, top: 0, bottom: 0, width: fillPct }),
          opacity,
          borderRadius: 'var(--radius-sm)',
          background: `repeating-linear-gradient(${v ? -60 : 30}deg, ${color} 0 1px, color-mix(in srgb, ${color} 55%, transparent) 1px 3px)`,
          transition: `${v ? 'height' : 'width'} var(--dur-slow) var(--ease-out), opacity var(--dur-fast) var(--ease-standard)`,
        }}
      />
    );
  }

  if (resolved === 'grid') {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: v ? 'flex-end' : 'center',
          justifyContent: v ? 'center' : 'flex-start',
        }}
      >
        <div
          style={{
            opacity,
            borderRadius: 2,
            background: color,
            transition: `${v ? 'height' : 'width'} var(--dur-slow) var(--ease-out), opacity var(--dur-fast) var(--ease-standard)`,
            ...(v ? { width: '46%', height: fillPct } : { height: '46%', width: fillPct }),
          }}
        />
      </div>
    );
  }

  if (resolved === 'block') {
    return (
      <div
        style={{
          position: 'absolute',
          ...(v ? { bottom: 0, left: 0, right: 0, height: fillPct } : { left: 0, top: 0, bottom: 0, width: fillPct }),
          opacity,
          background: color,
          transition: `${v ? 'height' : 'width'} var(--dur-slow) var(--ease-out), opacity var(--dur-fast) var(--ease-standard)`,
        }}
      />
    );
  }

  if (resolved === 'ghost') {
    return (
      <div style={{ position: 'absolute', inset: 0, opacity }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--surface-sunken)',
            borderRadius: 'var(--radius-sm)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            borderRadius: 'var(--radius-sm)',
            background: color,
            transition: `${v ? 'height' : 'width'} var(--dur-slow) var(--ease-out)`,
            ...(v ? { left: 0, right: 0, bottom: 0, height: fillPct, maxHeight: '100%' } : { top: 0, bottom: 0, left: 0, width: fillPct, maxWidth: '100%' }),
            // The "cap": a thin solid band at the value edge, the rest of the fill is a faint tint.
            boxShadow: v ? `inset 0 -6px 0 -1px ${color}` : `inset 6px 0 0 -1px ${color}`,
            opacity: 0.35,
          }}
        />
        <div
          style={{
            position: 'absolute',
            background: color,
            borderRadius: 999,
            ...(v ? { left: 0, right: 0, height: 6, bottom: fillPct, transform: 'translateY(3px)' } : { top: 0, bottom: 0, width: 6, left: fillPct, transform: 'translateX(-3px)' }),
            transition: `${v ? 'bottom' : 'left'} var(--dur-slow) var(--ease-out)`,
          }}
        />
      </div>
    );
  }

  if (resolved === 'capsule') {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity }}>
        <div
          style={{
            position: 'relative',
            borderRadius: 999,
            background: 'var(--surface-sunken)',
            overflow: 'hidden',
            ...(v ? { width: '58%', height: '100%' } : { height: '58%', width: '100%' }),
          }}
        >
          <div
            style={{
              position: 'absolute',
              borderRadius: 999,
              background: color,
              transition: `${v ? 'height' : 'width'} var(--dur-slow) var(--ease-out)`,
              ...(v ? { left: 0, right: 0, bottom: 0, height: fillPct } : { top: 0, bottom: 0, left: 0, width: fillPct }),
            }}
          />
        </div>
      </div>
    );
  }

  if (resolved === 'ticks') {
    const stripe = v
      ? `repeating-linear-gradient(to top, ${color} 0 4px, transparent 4px 7px)`
      : `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 7px)`;
    const track = v
      ? `repeating-linear-gradient(to top, var(--chart-grid) 0 4px, transparent 4px 7px)`
      : `repeating-linear-gradient(to right, var(--chart-grid) 0 4px, transparent 4px 7px)`;
    return (
      <div style={{ position: 'absolute', inset: 0, opacity }}>
        <div style={{ position: 'absolute', inset: 0, background: track, borderRadius: 2 }} />
        <div
          style={{
            position: 'absolute',
            background: stripe,
            transition: `${v ? 'height' : 'width'} var(--dur-slow) var(--ease-out)`,
            ...(v ? { left: 0, right: 0, bottom: 0, height: fillPct } : { top: 0, bottom: 0, left: 0, width: fillPct }),
          }}
        />
      </div>
    );
  }

  // lollipop: a thin stem sized to the value, with a dot at its tip.
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: v ? 'flex-end' : 'center', justifyContent: v ? 'center' : 'flex-start', opacity }}>
      <div
        style={{
          position: 'relative',
          background: color,
          borderRadius: 2,
          transition: `${v ? 'height' : 'width'} var(--dur-slow) var(--ease-out)`,
          ...(v ? { width: 2, height: fillPct } : { height: 2, width: fillPct }),
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 8,
            height: 8,
            borderRadius: 999,
            background: color,
            ...(v ? { top: -4, left: '50%', transform: 'translateX(-50%)' } : { right: -4, top: '50%', transform: 'translateY(-50%)' }),
          }}
        />
      </div>
    </div>
  );
}
