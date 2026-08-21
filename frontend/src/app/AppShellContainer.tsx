import { useEffect } from 'react';
import { AppShell } from '@/shared/layout/AppShell';
import { useThemeStore } from './theme-store';
import { resolveAccentPreset } from './accent-presets';
import { useSystemHealthSummary } from '@/domains/system-health/application/useSystemHealthSummary';
import { useAppearanceSync } from '@/domains/connections/application/useAppearanceSync';

/**
 * Connects the presentational AppShell to its data sources: appearance
 * (Zustand, UI-local, persisted to sessionStorage *and* the control-plane's
 * DB -- see useAppearanceSync) and system health (TanStack Query, server
 * state). This is the container half of the container/presentational split
 * -- all the wiring lives here so AppShell itself stays a pure layout
 * component.
 *
 * Note: visual-mode's, accent-color's, chart-style's, shadow-depth's,
 * font-size's, and dark-mode's *pickers* all live on the Connections
 * screen, not here -- that screen calls useThemeStore() independently to
 * get their setters. This container only reads the resulting state, to
 * sync it onto <html> as an attribute (data-mode/data-theme) or CSS
 * variable (the accent token map, --shadow-scale, --ui-scale) for
 * tokens.css/primitives.css/index.css to pick up.
 */
export function AppShellContainer() {
  useAppearanceSync();

  const { themeOverride, visualMode, accentId, shadowScale, uiScale } = useThemeStore();
  const isDark = themeOverride === 'dark';

  const { data: health } = useSystemHealthSummary();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    document.documentElement.setAttribute('data-mode', visualMode);
  }, [visualMode]);

  useEffect(() => {
    // An accent rewrites a small token map (brand + its hover/press states,
    // the ember ramp aliases the DS reads internally, chart/link colors),
    // not just one --accent property -- see accent-presets.ts. Applied as
    // inline styles on :root, which beats tokens.css's declarations for
    // exactly these properties, leaving everything else (surfaces, shadows)
    // alone.
    const preset = resolveAccentPreset(accentId);
    const root = document.documentElement;
    Object.entries(preset.tokens).forEach(([key, value]) => root.style.setProperty(key, value));
    // Clear any override left behind by a *previous* accent that this one
    // doesn't also set (e.g. switching from a hue-shifted preset, which
    // sets --ember-400/600/700, to plain Ember 500, which sets nothing).
    const previousKeys = ['--brand', '--brand-hover', '--brand-press', '--brand-tint', '--chart-primary', '--ember-400', '--ember-500', '--ember-600', '--ember-700', '--text-link', '--text-link-hover'];
    previousKeys.forEach((key) => {
      if (!(key in preset.tokens)) root.style.removeProperty(key);
    });
  }, [accentId]);

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
    />
  );
}
