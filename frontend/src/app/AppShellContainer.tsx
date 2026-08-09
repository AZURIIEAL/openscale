import { useEffect } from 'react';
import { AppShell } from '@/shared/layout/AppShell';
import { useThemeStore } from './theme-store';
import { resolveAccentPreset } from './accent-presets';
import { useSystemHealthSummary } from '@/domains/system-health/application/useSystemHealthSummary';

/**
 * Connects the presentational AppShell to its two data sources: appearance
 * (Zustand, UI-local, persisted to sessionStorage) and system health
 * (TanStack Query, server state). This is the container half of the
 * container/presentational split -- all the wiring lives here so AppShell
 * itself stays a pure layout component.
 *
 * Note: flat-mode's, accent-color's, shadow-depth's, and font-size's
 * *pickers* all live on the Connections screen, not here -- that screen
 * calls useThemeStore() independently to get their setters. This container
 * only reads the resulting state, to sync it onto <html> as an attribute
 * (data-flat) or CSS variable (--accent, --shadow-scale, --ui-scale) for
 * tokens.css/primitives.css/index.css to pick up.
 */
export function AppShellContainer() {
  const { themeOverride, isFlat, accentId, shadowScale, uiScale, setDark } = useThemeStore();
  const isDark = themeOverride === 'dark';

  const { data: health } = useSystemHealthSummary();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    document.documentElement.setAttribute('data-flat', String(isFlat));
  }, [isFlat]);

  useEffect(() => {
    const preset = resolveAccentPreset(accentId);
    // An inline style on :root beats tokens.css's [data-theme] rules for
    // this one property, which is exactly what's wanted -- pick the right
    // variant for the current theme and override just --accent, leaving
    // every other token (backgrounds, shadows, ink) alone.
    document.documentElement.style.setProperty('--accent', isDark ? preset.dark : preset.light);
  }, [accentId, isDark]);

  useEffect(() => {
    document.documentElement.style.setProperty('--shadow-scale', String(shadowScale));
  }, [shadowScale]);

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);

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
