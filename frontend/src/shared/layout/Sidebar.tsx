import { NavLink } from 'react-router-dom';
import { NAV_ENTRIES } from './navigation';
import { Well } from '@/shared/design-system/Well';
import { Led } from '@/shared/design-system/Led';
import { IconButton } from '@/shared/design-system/IconButton';
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

export function Sidebar({ servicesUp, servicesTotal, overallStatus, isOpen, onClose }: SidebarProps) {
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`os-panel fixed inset-y-0 left-0 z-50 flex w-[236px] flex-shrink-0 flex-col gap-5 rounded-[22px] transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-[120%]'
        }`}
        style={{ margin: '14px 0 14px 14px', padding: '22px 16px' }}
      >
        <div className="flex items-start justify-between px-2.5">
          <div>
            <span className="os-font-display text-[22px] uppercase tracking-wide">
              Open<span style={{ color: 'var(--accent)' }}>Scale</span>
            </span>
            <div className="os-font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>
              Control Console
            </div>
          </div>
          <IconButton label="Close menu" className="lg:hidden" onClick={onClose}>
            ✕
          </IconButton>
        </div>

        <nav aria-label="Primary" className="flex flex-col gap-1.5 overflow-y-auto">
          {primaryEntries.map((entry) => (
            <NavItemLink key={entry.path} entry={entry} onNavigate={onClose} />
          ))}

          <div
            className="os-font-mono px-2.5 pb-1 pt-3.5 text-[10px] uppercase tracking-[0.12em]"
            style={{ color: 'var(--ink-faint)' }}
          >
            System
          </div>
          {systemEntries.map((entry) => (
            <NavItemLink key={entry.path} entry={entry} onNavigate={onClose} />
          ))}
        </nav>

        <Well className="mt-auto flex items-center gap-2.5 p-3">
          <Led status={overallStatus} label={`${servicesUp} of ${servicesTotal} services up`} />
          <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            <b style={{ color: 'var(--ink)', fontWeight: 600 }}>
              {servicesUp}/{servicesTotal}
            </b>{' '}
            services up
          </span>
        </Well>
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
      className="os-nav-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold no-underline"
      style={({ isActive }) => ({ color: isActive ? undefined : 'var(--ink-muted)' })}
    >
      {({ isActive }) => {
        const Icon = entry.icon;
        return (
          <>
            <Icon
              className="h-4 w-4 flex-shrink-0"
              style={{ color: isActive ? 'var(--accent)' : 'var(--ink-faint)' }}
            />
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
