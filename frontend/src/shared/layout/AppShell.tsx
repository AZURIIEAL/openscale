import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import type { Status } from '@/shared/types/status';

interface AppShellProps {
  servicesUp: number;
  servicesTotal: number;
  systemStatus: Status;
}

/**
 * Structural shell: sidebar + top bar + routed screen content.
 * Deliberately dumb -- every piece of data it renders is a prop, supplied
 * by the composition root (app/App.tsx). AppShell itself never fetches
 * anything, so it stays trivially testable and has exactly one job: layout.
 * The one bit of local state (mobile nav open/closed) is pure UI, not data,
 * so it stays here rather than being threaded through the container.
 */
export function AppShell({ servicesUp, servicesTotal, systemStatus }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <div className="flex min-h-screen">
        <Sidebar
          servicesUp={servicesUp}
          servicesTotal={servicesTotal}
          overallStatus={systemStatus}
          isOpen={navOpen}
          onClose={() => setNavOpen(false)}
        />
        <main className="min-w-0 flex-1 px-4 pb-8 pt-4 sm:px-[28px] sm:pb-[40px] sm:pt-[22px]">
          <TopBar
            systemStatus={systemStatus}
            systemStatusLabel={`${servicesUp} of ${servicesTotal} services healthy`}
            onOpenMenu={() => setNavOpen(true)}
          />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
