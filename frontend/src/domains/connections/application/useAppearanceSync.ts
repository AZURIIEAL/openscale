import { useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { httpAppearanceGateway } from '../infrastructure/httpAppearanceGateway';
import { useThemeStore, type AppearanceSnapshot } from '@/app/theme-store';

const gateway = httpAppearanceGateway;

/**
 * Keeps the theme store's appearance settings (interface style, theme,
 * accent color, shadow/font scale) in sync with the control-plane's DB row,
 * which is the source of truth across sessions:
 *
 * - On mount, fetches the stored settings and hydrates the theme store with
 *   them. `hydrate()` writes through zustand's `persist` middleware same as
 *   any other store update, so sessionStorage picks up the server's values
 *   automatically -- no separate sessionStorage write needed here.
 * - After that initial hydration, every subsequent change to the theme
 *   store (from any setter, anywhere -- VisualModeSelector, the dark-mode
 *   Toggle, etc.) is debounced and PUT back to the control-plane, so the
 *   next load (any tab, any session) sees it.
 *
 * If the control-plane is unreachable on load, the hydrate step is simply
 * skipped -- whatever sessionStorage/defaults already gave the store stands,
 * and the next successful change still saves normally (PUT upserts the row,
 * so there's no dependency on the GET having succeeded first).
 */
export function useAppearanceSync() {
  const { data: stored, isFetched } = useQuery({
    queryKey: ['connections', 'appearance-settings'],
    queryFn: () => gateway.fetchSettings(),
    staleTime: Infinity,
    retry: 1,
  });

  const { mutate: save } = useMutation({
    mutationFn: (settings: AppearanceSnapshot) => gateway.saveSettings(settings),
  });

  const hydratedRef = useRef(false);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current || !isFetched) return;
    hydratedRef.current = true;
    if (!stored) return;

    // Only arm the skip if hydrating will actually change something --
    // the save-effect below only fires (and so only consumes the flag)
    // when its dependencies change. If the DB's row happens to already
    // match the store's current values (e.g. both are still the fresh
    // defaults), that effect never re-runs, so an unconditionally-armed
    // flag would sit there and silently swallow the *next real* change
    // instead -- which is exactly what happened before this check existed.
    const current = useThemeStore.getState();
    const changed =
      current.themeOverride !== stored.themeOverride ||
      current.visualMode !== stored.visualMode ||
      current.accentId !== stored.accentId ||
      current.chartStyle !== stored.chartStyle ||
      current.shadowScale !== stored.shadowScale ||
      current.uiScale !== stored.uiScale;
    if (changed) skipNextSaveRef.current = true;
    useThemeStore.getState().hydrate(stored);
  }, [stored, isFetched]);

  const themeOverride = useThemeStore((s) => s.themeOverride);
  const visualMode = useThemeStore((s) => s.visualMode);
  const accentId = useThemeStore((s) => s.accentId);
  const chartStyle = useThemeStore((s) => s.chartStyle);
  const shadowScale = useThemeStore((s) => s.shadowScale);
  const uiScale = useThemeStore((s) => s.uiScale);

  useEffect(() => {
    if (!hydratedRef.current) return; // don't save before the initial GET has had a chance to hydrate
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false; // this change *was* the hydration -- nothing new to persist
      return;
    }
    const timeout = setTimeout(() => {
      save({ themeOverride, visualMode, accentId, chartStyle, shadowScale, uiScale });
    }, 500);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeOverride, visualMode, accentId, chartStyle, shadowScale, uiScale]);
}
