import type { ReactNode } from 'react';

/** The dataset page's small secondary buttons. */
export function ActionButton({
  children,
  onClick,
  disabled,
  danger,
  title,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Tooltip. */
  title?: string;
  /** Accessible name, for buttons whose text is only a symbol. */
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className="os-well rounded-lg px-3 py-1.5 text-[12.5px]"
      style={{ border: 'none', cursor: disabled ? 'default' : 'pointer', color: danger ? 'var(--danger)' : 'var(--text-body)', opacity: disabled ? 0.6 : 1 }}
    >
      {children}
    </button>
  );
}
