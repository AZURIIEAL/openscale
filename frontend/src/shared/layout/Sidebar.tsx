import { NavLink } from 'react-router-dom';
import { NAV_ENTRIES } from './navigation';
import { Well } from '@/shared/design-system/Well';
import { Led } from '@/shared/design-system/Led';
import type { Status } from '@/shared/types/status';

interface SidebarProps {
  /** Aggregate service health for the footer strip. Supplied by the
   * system-health domain via App composition -- Sidebar itself has no
   * knowledge of *how* that's computed, only how to render it. */
  servicesUp: number;
  servicesTotal: number;
  overallStatus: Status;
}

const primaryEntries = NAV_ENTRIES.filter((e) => e.group !== 'system');
const systemEntries = NAV_ENTRIES.filter((e) => e.group === 'system');

export function Sidebar({ servicesUp, servicesTotal, overallStatus }: SidebarProps) {
  return (
    <aside
      className="os-panel flex w-[236px] flex-shrink-0 flex-col gap-5 rounded-[22px]"
      style={{ margin: '14px 0 14px 14px', padding: '22px 16px' }}
    >
      <div>
        <span className="os-font-display text-[22px] uppercase tracking-wide">OpenScale</span>
        <div className="os-font-mono mt-[-2px] pl-1.5 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--ink-faint)' }}>
          Control Console
        </div>
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-1.5">
        {primaryEntries.map((entry) => (
          <NavItemLink key={entry.path} entry={entry} />
        ))}

        <div
          className="os-font-mono px-2.5 pb-1 pt-3.5 text-[10px] uppercase tracking-[0.12em]"
          style={{ color: 'var(--ink-faint)' }}
        >
          System
        </div>
        {systemEntries.map((entry) => (
          <NavItemLink key={entry.path} entry={entry} />
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
  );
}

function NavItemLink({ entry }: { entry: NavEntry }) {
  return (
    <NavLink
      to={entry.path}
      end={entry.path === '/'}
      className="os-nav-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold no-underline"
      style={({ isActive }) => ({ color: isActive ? undefined : 'var(--ink-muted)' })}
    >
      {({ isActive }) => (
        <>
          <span
            className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
            style={{ background: isActive ? 'var(--accent)' : 'var(--ink-faint)', boxShadow: isActive ? '0 0 6px var(--accent)' : undefined }}
          />
          {entry.label}
        </>
      )}
    </NavLink>
  );
}

// Re-declared here (not imported) to keep NavItemLink's prop type local --
// avoids a second export nobody outside this file needs.
type NavEntry = (typeof primaryEntries)[number];
