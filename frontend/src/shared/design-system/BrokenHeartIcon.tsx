import type { ComponentPropsWithoutRef } from 'react';

/** Broken-heart glyph -- replaces LinkIcon on a card whose console exists
 * but is currently unreachable (status 'crit'). Signals "this normally
 * opens something, but not right now" rather than silently hiding the
 * affordance. */
export function BrokenHeartIcon({ className = '', ...rest }: ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      <path d="M13 7.5l-2 4 2.5 2-2 4" strokeWidth="1.75" />
    </svg>
  );
}
