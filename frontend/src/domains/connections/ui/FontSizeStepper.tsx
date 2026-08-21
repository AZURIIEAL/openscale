import { IconButton } from '@/shared/design-system/IconButton';

const MIN = 0.8;
const MAX = 1.4;
const STEP = 0.1;

interface FontSizeStepperProps {
  value: number;
  onChange: (value: number) => void;
}

/** Controls --ui-scale (index.css's #root zoom) -- +/- stepper rather than
 * a slider since "increase/decrease" is a discrete action, not a
 * continuous drag. Rounds to avoid float drift (0.1 + 0.2 !== 0.3). */
export function FontSizeStepper({ value, onChange }: FontSizeStepperProps) {
  const step = (delta: number) => {
    const next = Math.round((value + delta) * 100) / 100;
    onChange(Math.min(MAX, Math.max(MIN, next)));
  };

  return (
    <div className="flex items-center gap-2.5">
      <IconButton label="Decrease font size" onClick={() => step(-STEP)} disabled={value <= MIN}>
        −
      </IconButton>
      <span className="os-font-mono os-tabular-nums w-10 text-center text-[13px] font-semibold">
        {Math.round(value * 100)}%
      </span>
      <IconButton label="Increase font size" onClick={() => step(STEP)} disabled={value >= MAX}>
        +
      </IconButton>
    </div>
  );
}
