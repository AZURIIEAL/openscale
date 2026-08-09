import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_ACCENT_ID } from './accent-presets';

type ThemeOverride = 'light' | 'dark';

interface ThemeState {
  themeOverride: ThemeOverride;
  isFlat: boolean;
  /** Selected AccentPreset id (see accent-presets.ts). */
  accentId: string;
  setDark: (checked: boolean) => void;
  setFlat: (checked: boolean) => void;
  setAccent: (id: string) => void;
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
      isFlat: false,
      accentId: DEFAULT_ACCENT_ID,
      setDark: (checked) => set({ themeOverride: checked ? 'dark' : 'light' }),
      setFlat: (checked) => set({ isFlat: checked }),
      setAccent: (id) => set({ accentId: id }),
    }),
    {
      name: 'openscale-appearance',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
