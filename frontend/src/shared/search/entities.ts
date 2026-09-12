export type SearchCategory = 'screen' | 'job' | 'table' | 'run';

/** One row in the search dropdown. `path`/`navState` are exactly what
 * react-router's navigate(path, {state: navState}) needs -- the receiving
 * screen reads navState (if any) to land the user somewhere specific
 * (a job's form already open, a table's query pre-filled), not just on
 * the right screen in general. */
export interface SearchResultItem {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle?: string;
  path: string;
  navState?: Record<string, unknown>;
}

export type SearchResults = Record<SearchCategory, SearchResultItem[]>;
