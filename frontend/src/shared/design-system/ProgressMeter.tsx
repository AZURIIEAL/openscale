interface ProgressMeterProps {
  /** 0-100 (or 0-max) */
  value: number;
  max?: number;
  leftLabel?: string;
  rightLabel?: string;
  height?: number;
}

/** Linear resource meter (container memory/CPU on Home). Pure presentational
 * -- callers own the polling/data-fetching, this only knows how to render a
 * value against a track. Replaces the old circular Gauge, matching the
 * redesign's flat progress-bar language. */
export function ProgressMeter({ value, max = 100, leftLabel, rightLabel, height = 10 }: ProgressMeterProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div
        style={{
          position: 'relative',
          height,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'var(--ink-100)',
          boxShadow: 'var(--shadow-inset-track)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '0 auto 0 0',
            width: `${pct}%`,
            borderRadius: 999,
            background: 'var(--brand)',
            transition: 'width var(--dur-slow) var(--ease-out)',
          }}
        />
      </div>
      {(leftLabel || rightLabel) && (
        <div
          className="os-tabular-nums"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            marginTop: 10,
            fontSize: 13,
            color: 'var(--text-muted)',
          }}
        >
          <span>{leftLabel}</span>
          <span style={{ fontWeight: 700, color: 'var(--text-body)' }}>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}
