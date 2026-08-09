import type { ComponentPropsWithoutRef } from 'react';

/** Circular-arrow glyph for the restart control. */
export function RestartIcon({ className = '', ...rest }: ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d="M21 12a9 9 0 1 1-3.02-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
