import { useCallback, useEffect, useState } from 'react';
import type { QueryHistoryEntry } from '../domain/entities';

const STORAGE_KEY = 'openscale-query-history';
const MAX_ENTRIES = 50;

function loadHistory(): QueryHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueryHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Client-side-only run history -- there's no backend persistence for this
 * (the control-plane's /api/query is stateless), so it's kept in
 * localStorage instead, namespaced like the rest of this app's client-local
 * state (see app/theme-store.ts's 'openscale-appearance' key). A plain
 * useState + useEffect is enough here (unlike theme-store, this is owned by
 * one screen, not read app-wide, so Zustand would just be ceremony).
 * Newest first, capped at MAX_ENTRIES.
 */
export function useQueryHistory() {
  const [entries, setEntries] = useState<QueryHistoryEntry[]>(() => loadHistory());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Storage full/unavailable (private browsing, quota) -- history just
      // won't persist across reloads; not worth surfacing to the user.
    }
  }, [entries]);

  const addEntry = useCallback((entry: QueryHistoryEntry) => {
    setEntries((current) => [entry, ...current].slice(0, MAX_ENTRIES));
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  return { entries, addEntry, clear };
}
