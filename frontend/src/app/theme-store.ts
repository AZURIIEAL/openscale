import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_ACCENT_ID } from './accent-presets';
import type { ChartVariant } from '@/shared/design-system';

export type ThemeOverride = 'light' | 'dark';

export const DEFAULT_CHART_STYLE: ChartVariant = 'hatch';

/** Interface style, applied as data-mode on <html> (see tokens.css). `flat`
 * is the default -- the others (including the original `neumorphic` look)
 * are opt-in from the Connections screen. */
export type VisualMode =
  | 'flat'
  | 'neumorphic'
  | 'elevated'
  | 'glass'
  | 'outlined'
  | 'brutalist'
  | 'clay'
  | 'terminal'
  | 'aurora'
  | 'paper'
  | 'skeuomorphic'
  | 'high-contrast';

export const DEFAULT_VISUAL_MODE: VisualMode = 'flat';

interface ThemeState {
  themeOverride: ThemeOverride;
  visualMode: VisualMode;
  /** Selected AccentPreset id (see accent-presets.ts). */
  accentId: string;
  /** Chart plot treatment (Connections screen's "Chart style" picker) --
   * applied directly by Home's ConsoleBarChart, and translated to the
   * closest matching single-series treatment by Dashboards' own
   * interactive BarChart/HorizontalBarChart/TrendChart (see charts/BarMark
   * and TrendChart's trendTreatment, which keep hover/zoom intact and only
   * change the mark's look). */
  chartStyle: ChartVariant;
  /** Multiplies every neomorphic box-shadow's offset/blur (primitives.css). Only visible in `neumorphic` mode. 1 = default. */
  shadowScale: number;
  /** Zoom factor applied to #root (index.css) -- the app-wide "font size" control. 1 = 100%. */
  uiScale: number;
  setDark: (checked: boolean) => void;
  setVisualMode: (mode: VisualMode) => void;
  setAccent: (id: string) => void;
  setChartStyle: (style: ChartVariant) => void;
  setShadowScale: (value: number) => void;
  setUiScale: (value: number) => void;
  /** Applies a full snapshot in one write (one persisted-storage flush and
   * one re-render) -- used by useAppearanceSync to hydrate from the
   * control-plane's stored settings on load, instead of five separate
   * setters. */
  hydrate: (settings: AppearanceSnapshot) => void;
}

/** The subset of ThemeState that's actually persisted server-side -- see
 * domains/connections/application/useAppearanceSync.ts. */
export interface AppearanceSnapshot {
  themeOverride: ThemeOverride;
  visualMode: VisualMode;
  accentId: string;
  chartStyle: ChartVariant;
  shadowScale: number;
  uiScale: number;
}

/**
 * UI-local appearance state -- explicitly NOT server state, so this is the
 * one place Zustand is used per tech-stack.md ("Client/UI state: Zustand,
 * only for UI-local state"). Everything that comes from the control-plane
 * API belongs in a domain's application-layer query hooks instead.
 *
 * Defaults to light regardless of OS preference (product decision -- see
 * tokens.css, which has no prefers-color-scheme fallback either). Persisted
 * to sessionStorage, not localStorage: the choice should survive a refresh
 * within the same tab but not silently follow the user to a fresh session.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeOverride: 'light',
      visualMode: DEFAULT_VISUAL_MODE,
      accentId: DEFAULT_ACCENT_ID,
      chartStyle: DEFAULT_CHART_STYLE,
      shadowScale: 1,
      uiScale: 1,
      setDark: (checked) => set({ themeOverride: checked ? 'dark' : 'light' }),
      setVisualMode: (mode) => set({ visualMode: mode }),
      setAccent: (id) => set({ accentId: id }),
      setChartStyle: (style) => set({ chartStyle: style }),
      setShadowScale: (value) => set({ shadowScale: value }),
      setUiScale: (value) => set({ uiScale: value }),
      hydrate: (settings) => set(settings),
    }),
    {
      name: 'openscale-appearance',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
