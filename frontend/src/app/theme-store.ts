import { create } from 'zustand';

type ThemeOverride = 'light' | 'dark' | null;

interface ThemeState {
  /** null = follow prefers-color-scheme; otherwise an explicit override. */
  themeOverride: ThemeOverride;
  isFlat: boolean;
  setDark: (checked: boolean) => void;
  setFlat: (checked: boolean) => void;
}

/**
 * UI-local appearance state -- explicitly NOT server state, so this is the
 * one place Zustand is used per tech-stack.md ("Client/UI state: Zustand,
 * only for UI-local state"). Everything that comes from the control-plane
 * API belongs in a domain's application-layer query hooks instead.
 */
export const useThemeStore = create<ThemeState>((set) => ({
  themeOverride: null,
  isFlat: false,
  setDark: (checked) => set({ themeOverride: checked ? 'dark' : 'light' }),
  setFlat: (checked) => set({ isFlat: checked }),
}));
