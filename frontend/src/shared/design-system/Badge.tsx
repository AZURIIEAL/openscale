import type { ReactNode } from 'react';

type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'brand';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
}

const TONES: Record<BadgeTone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: 'var(--surface-sunken)', fg: 'var(--text-muted)', dot: 'var(--ink-400)' },
  success: { bg: 'var(--success-tint)', fg: 'var(--success)', dot: 'var(--success)' },
  danger: { bg: 'var(--danger-tint)', fg: 'var(--danger)', dot: 'var(--danger)' },
  warning: { bg: 'var(--warning-tint)', fg: '#9A7100', dot: 'var(--warning)' },
  info: { bg: 'var(--info-tint)', fg: 'var(--info)', dot: 'var(--info)' },
  brand: { bg: 'var(--brand-tint)', fg: 'var(--brand-hover)', dot: 'var(--brand)' },
};

/** General-purpose status pill (topbar "All systems normal", table status
 * cells) -- distinct from the older `StatusPill`, which is hard-wired to
 * the app's 3-value good/warn/crit `Status` type; `Badge` takes any tone. */
export function Badge({ children, tone = 'neutral', dot = false }: BadgeProps) {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 28,
        padding: '0 12px',
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        fontFamily: 'var(--font-core)',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: t.dot }} />}
      {children}
    </span>
  );
}
