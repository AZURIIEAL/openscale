import type { Status } from '@/shared/types/status';

interface LedProps {
  status: Status;
  /** Accessible label -- LEDs carry meaning by color alone otherwise, which
   * fails for color-blind users and screen readers. */
  label: string;
}

const statusClass: Record<Status, string> = {
  good: 'os-led-good',
  warn: 'os-led-warn',
  crit: 'os-led-crit',
};

/** Backlit status indicator -- deliberately outside the neomorphic shadow
 * system so it stays visible in flat mode (see tokens.css). */
export function Led({ status, label }: LedProps) {
  return <span className={`os-led ${statusClass[status]}`} role="img" aria-label={label} />;
}
