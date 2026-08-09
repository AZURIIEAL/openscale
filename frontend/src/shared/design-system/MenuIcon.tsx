import type { ComponentPropsWithoutRef } from 'react';

/** Hamburger glyph -- opens the sidebar drawer on narrow viewports. */
export function MenuIcon({ className = '', ...rest }: ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}
