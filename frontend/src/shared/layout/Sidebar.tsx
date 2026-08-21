import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { NAV_ENTRIES } from './navigation';
import type { Status } from '@/shared/types/status';

interface SidebarProps {
  /** Aggregate service health for the footer strip. Supplied by the
   * system-health domain via App composition -- Sidebar itself has no
   * knowledge of *how* that's computed, only how to render it. */
  servicesUp: number;
  servicesTotal: number;
  overallStatus: Status;
  /** Below the `lg` breakpoint the sidebar becomes an off-canvas drawer;
   * these control that. Ignored (sidebar always visible) at `lg` and up. */
  isOpen: boolean;
  onClose: () => void;
}

const primaryEntries = NAV_ENTRIES.filter((e) => e.group !== 'system');
const systemEntries = NAV_ENTRIES.filter((e) => e.group === 'system');

const STATUS_DOT: Record<Status, string> = {
  good: 'var(--success)',
  warn: 'var(--warning)',
  crit: 'var(--danger)',
};

export function Sidebar({ servicesUp, servicesTotal, overallStatus, isOpen, onClose }: SidebarProps) {
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`os-panel fixed inset-y-0 left-0 z-50 flex w-[232px] flex-shrink-0 flex-col gap-4 transition-transform duration-200 ease-out lg:sticky lg:top-6 lg:bottom-auto lg:max-h-[calc(100vh-48px)] lg:translate-x-0 lg:self-start lg:overflow-y-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-[120%]'
        }`}
        style={{ margin: '14px 0 14px 14px', padding: '20px 16px' }}
      >
        <div className="flex items-start justify-between px-2 pb-2">
          <div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-heading)', lineHeight: 1 }}>
              <span style={{ color: 'var(--brand)', fontWeight: 500 }}>[</span>
              OpenScale
              <span style={{ color: 'var(--brand)', fontWeight: 500 }}>]</span>
            </div>
            <div className="os-font-mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-subtle)', marginTop: 6 }}>
              Control Console
            </div>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            className="os-icon-btn lg:hidden"
            style={{ width: 30, height: 30 }}
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        <nav aria-label="Primary" className="flex flex-col gap-1 overflow-y-auto">
          {primaryEntries.map((entry) => (
            <NavItemLink key={entry.path} entry={entry} onNavigate={onClose} />
          ))}
        </nav>

        <div className="os-font-mono px-2.5 pb-0 pt-1" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>
          System
        </div>
        <nav aria-label="System" className="flex flex-col gap-1">
          {systemEntries.map((entry) => (
            <NavItemLink key={entry.path} entry={entry} onNavigate={onClose} />
          ))}
        </nav>

        <div
          className="mt-auto flex items-center gap-2"
          style={{ background: 'var(--surface-sunken)', borderRadius: 16, padding: '12px 14px' }}
        >
          <span
            role="img"
            aria-label={`${servicesUp} of ${servicesTotal} services up`}
            style={{ width: 6, height: 6, borderRadius: 999, background: STATUS_DOT[overallStatus], flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>
            {servicesUp}/{servicesTotal}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>services up</span>
        </div>
      </aside>
    </>
  );
}

function NavItemLink({ entry, onNavigate }: { entry: NavEntry; onNavigate: () => void }) {
  return (
    <NavLink
      to={entry.path}
      end={entry.path === '/'}
      onClick={onNavigate}
      className="os-nav-item flex w-full items-center gap-2.5 rounded-full px-3 py-2.5 text-left text-[14px] font-semibold no-underline transition-transform"
      style={({ isActive }) => ({ color: isActive ? undefined : 'var(--text-body)' })}
    >
      {({ isActive }) => {
        const Icon = entry.icon;
        return (
          <>
            <Icon size={18} strokeWidth={1.75} style={{ flexShrink: 0, color: isActive ? 'var(--text-on-inverse)' : 'var(--text-body)' }} />
            {entry.label}
          </>
        );
      }}
    </NavLink>
  );
}

// Re-declared here (not imported) to keep NavItemLink's prop type local --
// avoids a second export nobody outside this file needs.
type NavEntry = (typeof primaryEntries)[number];
