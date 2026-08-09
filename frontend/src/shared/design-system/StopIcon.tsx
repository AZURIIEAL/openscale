import type { ComponentPropsWithoutRef } from 'react';

/** Solid square -- shown when a container is running, stops it. */
export function StopIcon({ className = '', ...rest }: ComponentPropsWithoutRef<'svg'>) {
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
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}
