import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, X, Bell, ChevronDown, Menu } from 'lucide-react';
import { NAV_ENTRIES } from './navigation';
import { Badge } from '@/shared/design-system/Badge';
import { Avatar } from '@/shared/design-system/Avatar';
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

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

        <div
          className="hidden sm:flex"
          style={{
            alignItems: 'center',
            gap: 8,
            cursor: 'text',
            width: focused || query ? 280 : 240,
            height: 36,
            boxSizing: 'border-box',
            background: 'var(--surface-card)',
            borderRadius: 999,
            padding: '0 10px 0 13px',
            border: `1px solid ${focused ? 'var(--brand)' : 'var(--border-subtle)'}`,
            boxShadow: focused ? '0 0 0 3px var(--ring-tint)' : 'var(--shadow-card)',
            transition: 'width var(--dur-base) var(--ease-out), border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
          }}
          onClick={() => inputRef.current?.focus()}
        >
          <Search size={16} color="var(--text-subtle)" strokeWidth={1.75} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search jobs, tables, runs"
            aria-label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                e.currentTarget.blur();
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontFamily: 'var(--font-core)',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'var(--text-body)',
            }}
          />
          {!focused && !query && (
            <span className="os-kbd" style={{ flex: 'none' }}>
              ⌘K
            </span>
          )}
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                flex: 'none',
                padding: 0,
                border: 'none',
                borderRadius: 999,
                cursor: 'pointer',
                background: 'var(--surface-sunken)',
              }}
            >
              <X size={12} color="var(--text-muted)" />
            </button>
          )}
        </div>

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

        <button
          type="button"
          aria-label="Account: Abin Binu"
          className="hidden sm:flex"
          style={{
            alignItems: 'center',
            gap: 8,
            height: 36,
            boxSizing: 'border-box',
            padding: '0 10px 0 3px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 999,
            background: 'var(--surface-card)',
            boxShadow: 'var(--shadow-card)',
            cursor: 'pointer',
            fontFamily: 'var(--font-core)',
            textAlign: 'left',
          }}
        >
          <Avatar name="Abin Binu" size={30} />
          <span className="hidden md:flex" style={{ flexDirection: 'column', gap: 1, minWidth: 0, overflow: 'hidden' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-heading)', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
              Abin Binu
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--text-subtle)', whiteSpace: 'nowrap', lineHeight: 1.2 }}>Platform owner</span>
          </span>
          <ChevronDown size={14} color="var(--text-subtle)" className="hidden md:block" />
        </button>
      </div>
    </header>
  );
}
