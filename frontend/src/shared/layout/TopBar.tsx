import { useLocation } from 'react-router-dom';
import { NAV_ENTRIES } from './navigation';
import { StatusPill } from '@/shared/design-system/StatusPill';
import { Toggle } from '@/shared/design-system/Toggle';
import type { Status } from '@/shared/types/status';

interface TopBarProps {
  systemStatus: Status;
  systemStatusLabel: string;
  isDark: boolean;
  onToggleDark: (checked: boolean) => void;
}

const STATUS_MESSAGE: Record<Status, string> = {
  good: 'ALL SYSTEMS NORMAL',
  warn: 'DEGRADED',
  crit: 'INCIDENT',
};

export function TopBar({ systemStatus, systemStatusLabel, isDark, onToggleDark }: TopBarProps) {
  const { pathname } = useLocation();
  const title = NAV_ENTRIES.find((e) => e.path === pathname)?.label ?? 'OpenScale';

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <h1 className="os-font-display m-0 text-[26px] uppercase tracking-wide">{title}</h1>
      <div className="flex items-center gap-3.5">
        <StatusPill status={systemStatus}>
          <span title={systemStatusLabel}>{STATUS_MESSAGE[systemStatus]}</span>
        </StatusPill>
        <span className="os-kbd os-well px-2 py-1">⌘K</span>
        <Toggle checked={isDark} onChange={onToggleDark} label="Toggle dark mode" />
      </div>
    </div>
  );
}
