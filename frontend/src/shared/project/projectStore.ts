import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ProjectState {
  /** Slug of the project the user was last in; `/` redirects here. */
  lastProjectSlug: string | null;
  setLastProjectSlug: (slug: string) => void;
}

/** Persisted to localStorage (not sessionStorage like the theme store) so a
 * returning user lands in the project they left, even in a new tab. */
export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      lastProjectSlug: null,
      setLastProjectSlug: (slug) => set({ lastProjectSlug: slug }),
    }),
    { name: 'openscale-project', storage: createJSONStorage(() => localStorage) },
  ),
);
