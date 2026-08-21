import type { LucideIcon } from 'lucide-react';
import { DeltaChip } from './DeltaChip';

interface StatCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  delta?: string;
  deltaDirection?: 'up' | 'down';
  deltaCaption?: string;
  tone?: 'surface' | 'brand';
  style?: React.CSSProperties;
}

/** Headline metric tile -- the top row of the Home screen. */
export function StatCard({ label, value, icon: Icon, delta, deltaDirection = 'up', deltaCaption, tone = 'surface', style }: StatCardProps) {
  const brand = tone === 'brand';
  return (
    <div
      className="os-panel-sm"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 20,
        minHeight: 150,
        padding: 20,
        background: brand ? 'var(--brand)' : undefined,
        color: brand ? 'var(--text-on-brand)' : undefined,
        border: brand ? '1px solid var(--brand)' : undefined,
        ...style,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{label}</span>
        {Icon && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 999,
              flex: '0 0 auto',
              background: brand ? 'rgba(255,255,255,.22)' : 'var(--surface-card)',
              color: brand ? '#FFFFFF' : 'var(--text-body)',
            }}
          >
            <Icon size={18} strokeWidth={1.75} />
          </span>
        )}
      </header>
      <div>
        <div className="os-tabular-nums" style={{ fontSize: 40, lineHeight: 1.08, letterSpacing: '-0.025em', fontWeight: 700 }}>
          {value}
        </div>
        {delta && (
          <div style={{ marginTop: 12 }}>
            <DeltaChip value={delta} direction={deltaDirection} caption={deltaCaption} onBrand={brand} />
          </div>
        )}
      </div>
    </div>
  );
}
