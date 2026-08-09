import type { ComponentPropsWithoutRef } from 'react';

/** Primary action button styled as a physical push-button -- reserved for
 * job triggers (run pipeline, run query, replay) per the skeuomorphic
 * "controls specifically" rule in tech-stack.md. */
export function RunButton({ children, className = '', ...rest }: ComponentPropsWithoutRef<'button'>) {
  return (
    <button type="button" className={`os-run-btn ${className}`} {...rest}>
      {children}
    </button>
  );
}
