import { useEffect, useState } from 'react';
import { AppShell } from '@/shared/layout/AppShell';
import { useThemeStore } from './theme-store';
import { useSystemHealthSummary } from '@/domains/system-health/application/useSystemHealthSummary';

function usePrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, []);
  return prefersDark;
}

/**
 * Connects the presentational AppShell to its two data sources: appearance
 * (Zustand, UI-local) and system health (TanStack Query, server state).
 * This is the container half of the container/presentational split -- all
 * the wiring lives here so AppShell itself stays a pure layout component.
 *
 * Note: flat-mode's *toggle* lives on the Connections screen, not here --
 * that screen calls useThemeStore() independently to get setFlat. This
 * container only needs to read isFlat, to sync it onto <html> as an
 * attribute for tokens.css's `[data-flat]` selectors to pick up.
 */
export function AppShellContainer() {
  const { themeOverride, isFlat, setDark } = useThemeStore();
  const prefersDark = usePrefersDark();
  const isDark = themeOverride ? themeOverride === 'dark' : prefersDark;

  const { data: health } = useSystemHealthSummary();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    document.documentElement.setAttribute('data-flat', String(isFlat));
  }, [isFlat]);

  return (
    <AppShell
      servicesUp={health?.services.filter((s) => s.status === 'good').length ?? 0}
      servicesTotal={health?.services.length ?? 0}
      systemStatus={health?.overallStatus ?? 'good'}
      isDark={isDark}
      onToggleDark={setDark}
    />
  );
}
