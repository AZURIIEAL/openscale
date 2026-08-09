interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** Neomorphic switch. Controlled component -- state lives with the caller
 * (a domain's application layer or a UI-local store), never inside Toggle
 * itself, so it stays a pure presentational primitive. */
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="os-toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="os-toggle-knob" />
    </button>
  );
}
