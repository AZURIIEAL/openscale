import { ArrowUp, ArrowDown } from 'lucide-react';

interface DeltaChipProps {
  value: string;
  direction?: 'up' | 'down';
  caption?: string;
  onBrand?: boolean;
}

/** Small trend pill (+/- value with an arrow) used inside StatCard and next
 * to chart totals. The pill keeps its real up/down color (green/red) even
 * `onBrand` (StatCard's `tone="brand"` variant, a solid --brand card) --
 * it has its own opaque tinted background, so it reads fine regardless of
 * what's behind it. `onBrand` only affects the caption, which sits
 * directly on the brand background with no pill of its own. */
export function DeltaChip({ value, direction = 'up', caption, onBrand = false }: DeltaChipProps) {
  const positive = direction === 'up';
  const Arrow = positive ? ArrowUp : ArrowDown;
  const palette = positive ? { bg: 'var(--success-tint)', fg: 'var(--success)' } : { bg: 'var(--danger-tint)', fg: 'var(--danger)' };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          height: 24,
          padding: '0 8px',
          borderRadius: 999,
          background: palette.bg,
          color: palette.fg,
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        <Arrow size={12} strokeWidth={2.5} />
        {value}
      </span>
      {caption && (
        <span style={{ fontSize: 14, color: onBrand ? 'rgba(255,255,255,.86)' : 'var(--text-muted)' }}>{caption}</span>
      )}
    </span>
  );
}
