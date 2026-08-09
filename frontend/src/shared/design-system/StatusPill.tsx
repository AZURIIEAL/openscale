import type { ReactNode } from 'react';
import type { Status } from '@/shared/types/status';

interface StatusPillProps {
  status: Status;
  children: ReactNode;
}

const statusClass: Record<Status, string> = {
  good: 'os-status-pill-good',
  warn: 'os-status-pill-warn',
  crit: 'os-status-pill-crit',
};

/** Compact text+dot status badge -- for table rows, list items, run status. */
export function StatusPill({ status, children }: StatusPillProps) {
  return (
    <span className={`os-status-pill ${statusClass[status]}`}>
      <span className="os-dot" />
      {children}
    </span>
  );
}
