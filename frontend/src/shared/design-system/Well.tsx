import type { ComponentPropsWithoutRef } from 'react';

/** Inset ("pressed") neomorphic surface -- used for table containers, log
 * panels, input fields, and anything meant to read as a recessed groove
 * rather than a raised card. */
export function Well({ className = '', ...rest }: ComponentPropsWithoutRef<'div'>) {
  return <div className={`os-well ${className}`} {...rest} />;
}
