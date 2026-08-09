import { ACCENT_PRESETS } from '@/app/accent-presets';

interface ThemeColorPickerProps {
  accentId: string;
  isDark: boolean;
  onSelect: (id: string) => void;
}

/** Grid of preset accent-color swatches -- shows each preset's variant for
 * the *current* theme, so the swatch is an honest preview of what picking
 * it actually looks like right now, not a fixed reference color. */
export function ThemeColorPicker({ accentId, isDark, onSelect }: ThemeColorPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-3.5 py-1">
      {ACCENT_PRESETS.map((preset) => {
        const color = isDark ? preset.dark : preset.light;
        const selected = preset.id === accentId;
        return (
          <button
            key={preset.id}
            type="button"
            title={preset.name}
            aria-label={`Use ${preset.name} theme color`}
            aria-pressed={selected}
            onClick={() => onSelect(preset.id)}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95"
            style={{
              background: color,
              boxShadow: selected ? `0 0 0 2px var(--bg), 0 0 0 4px ${color}` : 'none',
            }}
          >
            {selected && (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
