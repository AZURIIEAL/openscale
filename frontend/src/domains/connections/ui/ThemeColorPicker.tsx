import { Check } from 'lucide-react';
import { ACCENT_PRESETS } from '@/app/accent-presets';

interface ThemeColorPickerProps {
  accentId: string;
  onSelect: (id: string) => void;
}

/** Grid of the twelve accent presets -- Ember at four depths, plus eight
 * hues at two depths each. Unlike interface style, an accent's swatch color
 * is the same regardless of the current theme (see accent-presets.ts). */
export function ThemeColorPicker({ accentId, onSelect }: ThemeColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {ACCENT_PRESETS.map((preset) => {
        const selected = preset.id === accentId;
        return (
          <button
            key={preset.id}
            type="button"
            title={preset.name}
            aria-label={`Use ${preset.name} accent`}
            aria-pressed={selected}
            onClick={() => onSelect(preset.id)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95"
            style={{
              background: preset.swatch,
              border: selected ? '2px solid var(--text-heading)' : '1px solid var(--border-default)',
              boxShadow: selected ? '0 0 0 3px var(--ring-tint)' : 'none',
            }}
          >
            {selected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}
