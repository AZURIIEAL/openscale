/**
 * Selectable theme colors for the Connections screen's theme setter.
 * Each preset carries a light- and dark-theme variant, same as the
 * default teal in tokens.css -- light values are dark/saturated enough for
 * the light theme's near-white --accent-ink text, dark values are light
 * enough for the dark theme's near-black --accent-ink text.
 */
export interface AccentPreset {
  id: string;
  name: string;
  light: string;
  dark: string;
}

export const DEFAULT_ACCENT_ID = 'teal';

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'teal', name: 'Teal', light: '#3e6e6b', dark: '#6fb0ab' },
  { id: 'blue', name: 'Blue', light: '#2563eb', dark: '#60a5fa' },
  { id: 'indigo', name: 'Indigo', light: '#4f46e5', dark: '#818cf8' },
  { id: 'violet', name: 'Violet', light: '#7c3aed', dark: '#a78bfa' },
  { id: 'purple', name: 'Purple', light: '#9333ea', dark: '#c084fc' },
  { id: 'pink', name: 'Pink', light: '#db2777', dark: '#f472b6' },
  { id: 'rose', name: 'Rose', light: '#e11d48', dark: '#fb7185' },
  { id: 'amber', name: 'Amber', light: '#d97706', dark: '#fbbf24' },
  { id: 'green', name: 'Green', light: '#16a34a', dark: '#4ade80' },
  { id: 'emerald', name: 'Emerald', light: '#059669', dark: '#34d399' },
  { id: 'cyan', name: 'Cyan', light: '#0891b2', dark: '#22d3ee' },
  { id: 'slate', name: 'Slate', light: '#475569', dark: '#94a3b8' },
];

export function resolveAccentPreset(id: string): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT_ID)!;
}
