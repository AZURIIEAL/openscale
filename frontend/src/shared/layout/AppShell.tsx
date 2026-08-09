import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import type { Status } from '@/shared/types/status';

interface AppShellProps {
  servicesUp: number;
  servicesTotal: number;
  systemStatus: Status;
  isDark: boolean;
  onToggleDark: (checked: boolean) => void;
}

/**
 * Structural shell: sidebar + top bar + routed screen content.
 * Deliberately dumb -- every piece of data it renders is a prop, supplied
 * by the composition root (app/App.tsx). AppShell itself never fetches
 * anything, so it stays trivially testable and has exactly one job: layout.
 */
export function AppShell({ servicesUp, servicesTotal, systemStatus, isDark, onToggleDark }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar servicesUp={servicesUp} servicesTotal={servicesTotal} overallStatus={systemStatus} />
      <main className="min-w-0 flex-1 px-[28px] pb-[40px] pt-[22px]">
        <TopBar
          systemStatus={systemStatus}
          systemStatusLabel={`${servicesUp} of ${servicesTotal} services healthy`}
          isDark={isDark}
          onToggleDark={onToggleDark}
        />
        <Outlet />
      </main>
    </div>
  );
}
