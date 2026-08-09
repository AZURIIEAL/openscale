import type { ComponentPropsWithoutRef } from 'react';

type PanelSize = 'default' | 'sm';

interface PanelProps extends ComponentPropsWithoutRef<'div'> {
  /** `sm` uses a lighter shadow -- for nested/secondary surfaces (stat cards,
   * health cards) inside a larger `default` panel. */
  size?: PanelSize;
}

const sizeClass: Record<PanelSize, string> = {
  default: 'os-panel',
  sm: 'os-panel-sm',
};

/** Raised neomorphic surface -- the base structural card used everywhere. */
export function Panel({ size = 'default', className = '', ...rest }: PanelProps) {
  return <div className={`${sizeClass[size]} ${className}`} {...rest} />;
}
