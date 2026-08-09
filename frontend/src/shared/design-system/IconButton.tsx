import type { ComponentPropsWithoutRef } from 'react';

interface IconButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: 'default' | 'crit';
  label: string;
}

/** Small embossed icon-only button (restart/stop/edit actions in list rows). */
export function IconButton({ variant = 'default', label, className = '', ...rest }: IconButtonProps) {
  const variantClass = variant === 'crit' ? 'os-icon-btn-crit' : '';
  return (
    <button type="button" aria-label={label} className={`os-icon-btn ${variantClass} ${className}`} {...rest} />
  );
}
