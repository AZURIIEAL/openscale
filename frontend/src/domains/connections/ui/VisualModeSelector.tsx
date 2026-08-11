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
 * tokens.css. Kept in sync with those rules by hand. */
const MODES: ModeOption[] = [
  {
    id: 'flat',
    label: 'Flat',
    description: 'Solid surfaces, crisp borders, no shadow',
    preview: { background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'none' },
  },
  {
    id: 'neumorphic',
    label: 'Neumorphic',
    description: 'Soft embossed dual-shadow surfaces',
    preview: {
      background: 'var(--bg)',
      border: 'none',
      boxShadow: '3px 3px 6px var(--shadow-lo), -3px -3px 6px var(--shadow-hi)',
    },
  },
  {
    id: 'elevated',
    label: 'Elevated',
    description: 'Solid surfaces lifted with a drop shadow',
    preview: {
      background: 'var(--surface)',
      border: 'none',
      boxShadow: '0 1px 2px var(--shadow-lo-soft), 0 4px 10px var(--shadow-lo)',
    },
  },
  {
    id: 'glass',
    label: 'Glass',
    description: 'Translucent, blurred surfaces',
    preview: {
      background: 'color-mix(in srgb, var(--surface) 55%, transparent)',
      border: '1px solid var(--border)',
      boxShadow: 'none',
      backdropFilter: 'blur(6px)',
    },
  },
  {
    id: 'outlined',
    label: 'Outlined',
    description: 'No fill, just a bold line',
    preview: { background: 'var(--bg)', border: '1.5px solid var(--border-strong)', boxShadow: 'none' },
  },
  {
    id: 'brutalist',
    label: 'Brutalist',
    description: 'Thick borders, hard offset shadow',
    preview: { background: 'var(--surface)', border: '2px solid var(--ink)', borderRadius: 6, boxShadow: '3px 3px 0 var(--ink)' },
  },
  {
    id: 'clay',
    label: 'Clay',
    description: 'Puffy, colorful soft-shadow surfaces',
    preview: {
      background: 'var(--surface)',
      border: 'none',
      borderRadius: 20,
      boxShadow:
        '0 6px 14px color-mix(in srgb, var(--accent) 30%, transparent), inset 0 2px 2px color-mix(in srgb, white 45%, transparent)',
    },
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Monospace surfaces with a glowing border',
    preview: {
      background: 'var(--surface)',
      border: '1px solid var(--accent)',
      borderRadius: 6,
      boxShadow: '0 0 10px color-mix(in srgb, var(--accent) 45%, transparent)',
    },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Gradient wash with an ambient glow',
    preview: {
      background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--surface)), var(--surface) 70%)',
      border: '1px solid var(--border)',
      boxShadow: '0 4px 14px color-mix(in srgb, var(--accent) 25%, transparent)',
    },
  },
  {
    id: 'paper',
    label: 'Paper',
    description: 'Warm, borderless stacked-sheet look',
    preview: {
      background: 'color-mix(in srgb, var(--surface) 92%, #f2e8d5 8%)',
      border: 'none',
      borderRadius: 4,
      boxShadow: '0 6px 14px var(--shadow-lo-soft)',
    },
  },
  {
    id: 'skeuomorphic',
    label: 'Skeuomorphic',
    description: 'Beveled gradient hardware-button look',
    preview: {
      background: 'linear-gradient(180deg, color-mix(in srgb, white 10%, var(--surface)), var(--surface))',
      border: '1px solid var(--border)',
      borderRadius: 8,
      boxShadow: 'inset 0 1px 0 color-mix(in srgb, white 50%, transparent), 0 2px 4px var(--shadow-lo)',
    },
  },
  {
    id: 'high-contrast',
    label: 'High contrast',
    description: 'Pure borders, no shadow, max legibility',
    preview: { background: 'var(--surface)', border: '2px solid var(--ink)', boxShadow: 'none' },
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
            className="flex flex-col items-center gap-1.5 rounded-xl p-2 transition-transform active:scale-[0.97]"
            style={{
              outline: selected ? '2px solid var(--accent)' : '2px solid transparent',
              outlineOffset: 2,
            }}
          >
            <span className="flex h-11 w-full items-center justify-center rounded-lg" style={mode.preview}>
              {selected && (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            <span className="text-[11.5px] font-semibold" style={{ color: selected ? 'var(--accent)' : 'var(--ink)' }}>
              {mode.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
