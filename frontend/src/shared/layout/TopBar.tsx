import { useLocation } from 'react-router-dom';
import { Bell, Menu } from 'lucide-react';
import { NAV_ENTRIES } from './navigation';
import { SearchBar } from './SearchBar';
import { AccountMenu } from './AccountMenu';
import { Badge } from '@/shared/design-system/Badge';
import type { Status } from '@/shared/types/status';

interface TopBarProps {
  systemStatus: Status;
  systemStatusLabel: string;
  onOpenMenu: () => void;
}

const STATUS_TONE: Record<Status, 'success' | 'warning' | 'danger'> = {
  good: 'success',
  warn: 'warning',
  crit: 'danger',
};
const STATUS_MESSAGE: Record<Status, string> = {
  good: 'All systems normal',
  warn: 'Degraded',
  crit: 'Incident',
};

/**
 * Screen title/subtitle + the global status badge, search field (with a
 * ⌘K focus hotkey), notification bell and account affordance. Title and
 * subtitle come from the matched NAV_ENTRIES row, same single source of
 * truth the sidebar uses.
 */
export function TopBar({ systemStatus, systemStatusLabel, onOpenMenu }: TopBarProps) {
  const { pathname } = useLocation();
  const entry = NAV_ENTRIES.find((e) => e.path === pathname);
  const title = entry?.label ?? 'OpenScale';
  const subtitle = entry?.subtitle ?? '';

  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3" style={{ minHeight: 56 }}>
      <div className="flex min-w-0 flex-1 items-center gap-3" style={{ flexBasis: 280 }}>
        <button
          type="button"
          aria-label="Open menu"
          className="os-icon-btn lg:hidden"
          style={{ width: 32, height: 32, flexShrink: 0 }}
          onClick={onOpenMenu}
        >
          <Menu size={16} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate" style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-heading)' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="truncate" style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex min-w-0 max-w-full flex-none items-center gap-2.5">
        <Badge tone={STATUS_TONE[systemStatus]} dot>
          <span title={systemStatusLabel}>{STATUS_MESSAGE[systemStatus]}</span>
        </Badge>

        <SearchBar />

        <button type="button" aria-label="Notifications" className="os-icon-btn" style={{ position: 'relative' }}>
          <Bell size={18} strokeWidth={1.75} />
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 7,
              height: 7,
              borderRadius: 999,
              background: 'var(--brand)',
              boxShadow: '0 0 0 2px var(--surface-card)',
            }}
          />
        </button>

        <AccountMenu />
      </div>
    </header>
  );
}
