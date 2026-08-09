const MIN = 0.4;
const MAX = 1.6;
const STEP = 0.1;

interface ShadowDepthSliderProps {
  value: number;
  onChange: (value: number) => void;
}

/** Controls --shadow-scale (primitives.css), which multiplies every
 * neomorphic box-shadow's offset/blur. Native range input -- accent-color
 * themes its thumb/track to match the selected theme color for free. */
export function ShadowDepthSlider({ value, onChange }: ShadowDepthSliderProps) {
  return (
    <div className="flex w-[168px] items-center gap-2.5">
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ accentColor: 'var(--accent)' }}
        className="h-1.5 w-full cursor-pointer"
        aria-label="Shadow depth"
      />
      <span className="os-font-mono os-tabular-nums w-9 text-right text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}
