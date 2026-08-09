import type { ComponentPropsWithoutRef } from 'react';

/** Solid triangle -- shown when a container is stopped, starts it. */
export function PlayIcon({ className = '', ...rest }: ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  );
}
