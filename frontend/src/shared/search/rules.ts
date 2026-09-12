import type { SearchCategory } from './entities';

export const MAX_RESULTS_PER_CATEGORY = 5;

export const CATEGORY_LABEL: Record<SearchCategory, string> = {
  screen: 'Screens',
  job: 'Jobs',
  table: 'Tables',
  run: 'Recent runs',
};

/** Case-insensitive substring match against any of the given fields --
 * no fuzzy scoring, this is a small, fully-enumerable result set (10 nav
 * entries, 5 job types, however many real tables/runs exist), not a
 * search-engine problem that needs ranking. */
export function matchesQuery(query: string, ...fields: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return fields.some((f) => !!f && f.toLowerCase().includes(q));
}
