import type { CSSProperties } from 'react';
import type { VisualMode } from '@/app/theme-store';

interface ModeOption {
  id: VisualMode;
  label: string;
  description: string;
  preview: CSSProperties;
}

/** Inline styles rather than the `.os-panel`-family classes -- these swatches
 * must render mode X's look while a *different* mode is the one actually
 * active on <html>, so they can't rely on the [data-mode='X'] selectors in
 * tokens.css. Kept in sync with those rules by hand -- see tokens.css. */
const MODES: ModeOption[] = [
  {
    id: 'flat',
    label: 'Flat',
    description: 'Solid surfaces, a real border, one quiet shadow',
    preview: { background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)' },
  },
  {
    id: 'neumorphic',
    label: 'Neumorphic',
    description: 'Soft embossed dual-shadow surfaces',
    preview: {
      background: 'var(--canvas)',
      border: 'none',
      boxShadow: '3px 3px 6px var(--shadow-lo), -3px -3px 6px var(--shadow-hi)',
    },
  },
  {
    id: 'elevated',
    label: 'Elevated',
    description: 'Solid surfaces lifted with a drop shadow',
    preview: {
      background: 'var(--surface-card)',
      border: 'none',
      boxShadow: '0 8px 18px -8px rgba(17,17,17,.22)',
    },
  },
  {
    id: 'glass',
    label: 'Glass',
    description: 'Translucent, blurred surfaces',
    preview: {
      background: 'color-mix(in srgb, var(--surface-card) 55%, transparent)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'none',
      backdropFilter: 'blur(6px)',
    },
  },
  {
    id: 'outlined',
    label: 'Outlined',
    description: 'No fill beyond the shell, just a bold line',
    preview: { background: 'var(--canvas)', border: '1.5px solid var(--border-strong)', boxShadow: 'none' },
  },
  {
    id: 'brutalist',
    label: 'Brutalist',
    description: 'Thick borders, hard offset shadow',
    preview: {
      background: 'var(--surface-card)',
      border: '2px solid var(--text-heading)',
      borderRadius: 0,
      boxShadow: '3px 3px 0 var(--text-heading)',
    },
  },
  {
    id: 'clay',
    label: 'Clay',
    description: 'Puffy soft-shadow surfaces',
    preview: {
      background: 'var(--surface-card)',
      border: 'none',
      borderRadius: 20,
      boxShadow: 'inset 0 -4px 8px rgba(17,17,17,.08), 0 6px 14px -6px rgba(17,17,17,.2)',
    },
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Monospace surfaces on a near-black canvas',
    preview: {
      background: '#111111',
      border: '1px solid var(--brand)',
      borderRadius: 6,
      boxShadow: '0 0 10px color-mix(in srgb, var(--brand) 45%, transparent)',
    },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Gradient wash with an ambient glow',
    preview: {
      background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand) 18%, var(--surface-card)), var(--surface-card) 70%)',
      border: '1px solid var(--border-subtle)',
      boxShadow: '0 4px 14px color-mix(in srgb, var(--brand) 25%, transparent)',
    },
  },
  {
    id: 'paper',
    label: 'Paper',
    description: 'Warm, borderless stacked-sheet look',
    preview: {
      background: '#fdfcf8',
      border: 'none',
      borderRadius: 4,
      boxShadow: '0 6px 14px rgba(17,17,17,.08)',
    },
  },
  {
    id: 'skeuomorphic',
    label: 'Skeuomorphic',
    description: 'Beveled gradient hardware-button look',
    preview: {
      background: 'linear-gradient(180deg, color-mix(in srgb, white 10%, var(--surface-card)), var(--surface-card))',
      border: '1px solid var(--border-default)',
      borderRadius: 8,
      boxShadow: 'inset 0 1px 0 color-mix(in srgb, white 50%, transparent), 0 2px 4px rgba(17,17,17,.15)',
    },
  },
  {
    id: 'high-contrast',
    label: 'High contrast',
    description: 'Pure borders, no shadow, max legibility',
    preview: { background: 'var(--surface-card)', border: '2px solid var(--text-heading)', boxShadow: 'none' },
  },
];

interface VisualModeSelectorProps {
  value: VisualMode;
  onChange: (mode: VisualMode) => void;
}

export function VisualModeSelector({ value, onChange }: VisualModeSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Interface style">
      {MODES.map((mode) => {
        const selected = mode.id === value;
        return (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={mode.description}
            onClick={() => onChange(mode.id)}
            className="flex flex-col items-start gap-2.5 rounded-2xl p-3 text-left transition-transform active:scale-[0.97]"
            style={{
              background: selected ? 'var(--surface-sunken)' : 'var(--surface-card)',
              border: selected ? '1px solid var(--brand)' : '1px solid var(--border-subtle)',
              boxShadow: selected ? '0 0 0 3px var(--ring-tint)' : 'none',
            }}
          >
            <span className="flex h-11 w-full items-center justify-center rounded-lg" style={mode.preview}>
              {selected && (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            <span className="text-[13px] font-semibold" style={{ color: selected ? 'var(--text-heading)' : 'var(--text-body)' }}>
              {mode.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
