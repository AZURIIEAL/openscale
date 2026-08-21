/**
 * Selectable accent colors for the Connections screen's "Accent" picker.
 * Ember (the brand ramp already in tokens.css) is the system default, with
 * four depths; the other eight are full hues at two depths each. Each
 * preset is a small token-override map -- not just one swatch color -- so
 * picking one rewrites --brand, its hover/press states, --chart-primary
 * and the link colors together, the same set the mockup's `ACCENTS` table
 * rewrites. Unlike VisualMode, an accent's override is identical in light
 * and dark (only the surfaces around it change with the theme).
 */
export interface AccentPreset {
  id: string;
  name: string;
  /** Swatch color shown in the picker grid. */
  swatch: string;
  tokens: Record<string, string>;
}

export const DEFAULT_ACCENT_ID = 'ember-500';

function hue(id: string, name: string, base: string, hover: string, press: string, tint: string): AccentPreset {
  return {
    id,
    name,
    swatch: base,
    tokens: {
      '--brand': base,
      '--brand-hover': hover,
      '--brand-press': press,
      '--brand-tint': tint,
      '--chart-primary': base,
      '--ember-400': tint,
      '--ember-500': base,
      '--ember-600': hover,
      '--ember-700': press,
      '--text-link': hover,
      '--text-link-hover': press,
    },
  };
}

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'ember-400',
    name: 'Ember 400',
    swatch: '#F4784F',
    tokens: {
      '--brand': 'var(--ember-400)',
      '--brand-hover': 'var(--ember-500)',
      '--brand-press': 'var(--ember-600)',
      '--chart-primary': 'var(--ember-400)',
      '--ember-500': '#F4784F',
      '--ember-400': '#F79C7C',
      '--text-link': 'var(--ember-500)',
    },
  },
  { id: 'ember-500', name: 'Ember 500', swatch: '#EF5E2C', tokens: {} },
  {
    id: 'ember-600',
    name: 'Ember 600',
    swatch: '#D64C1E',
    tokens: {
      '--brand': 'var(--ember-600)',
      '--brand-hover': 'var(--ember-700)',
      '--chart-primary': 'var(--ember-600)',
      '--ember-500': '#D64C1E',
      '--ember-400': '#EF5E2C',
      '--text-link': 'var(--ember-700)',
    },
  },
  {
    id: 'ember-700',
    name: 'Ember 700',
    swatch: '#AF3C16',
    tokens: {
      '--brand': 'var(--ember-700)',
      '--brand-hover': '#8E2F11',
      '--chart-primary': 'var(--ember-700)',
      '--ember-500': '#AF3C16',
      '--ember-400': '#D64C1E',
      '--text-link': 'var(--ember-700)',
    },
  },
  hue('red-500', 'Red 500', '#E03131', '#C92A2A', '#A51E1E', '#FF8787'),
  hue('red-700', 'Red 700', '#A51E1E', '#8A1919', '#701414', '#E03131'),
  hue('green-500', 'Green 500', '#2F9E44', '#2B8A3E', '#237032', '#69DB7C'),
  hue('green-700', 'Green 700', '#1F6F32', '#1A5C2A', '#154A22', '#2F9E44'),
  hue('blue-500', 'Blue 500', '#1C7ED6', '#1971C2', '#155FA0', '#74C0FC'),
  hue('blue-700', 'Blue 700', '#14539E', '#114685', '#0E386B', '#1C7ED6'),
  hue('teal-500', 'Teal 500', '#0CA678', '#099268', '#077F5A', '#63E6BE'),
  hue('violet-500', 'Violet 500', '#7048E8', '#6741D9', '#5935C4', '#B197FC'),
];

export function resolveAccentPreset(id: string): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT_ID)!;
}
