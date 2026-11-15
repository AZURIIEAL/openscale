/**
 * Result of a successful query -- generic (columns aren't known ahead of
 * time, unlike this app's other bespoke tables) since any SELECT can be
 * typed in.
 */
export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  durationMs: number;
  /** True when the server stopped reading after its row cap (500) rather
   * than exhausting the real result set. */
  truncated: boolean;
}

/** The control-plane's /api/query always responds HTTP 200 -- a SQL error
 * is a normal query *outcome*, not a transport failure -- so this is a
 * value in the response body, not a thrown error. */
export interface QueryError {
  error: string;
}

export interface CatalogColumn {
  name: string;
  type: string;
}

export interface CatalogTable {
  schema: string;
  table: string;
  columns: CatalogColumn[];
}

/** One entry in the client-side-only run history (see
 * application/useQueryHistory.ts -- there's no backend persistence for
 * this). */
export interface QueryHistoryEntry {
  sql: string;
  ranAt: string;
  success: boolean;
  /** Absent for a failed run. */
  rowCount?: number;
}

/** How a saved query becomes a dashboard tile. Mirrors queries.Chart in Go. */
export type ChartType = 'line' | 'bar' | 'hbar' | 'number';
export interface ChartSpec {
  type: ChartType;
  /** The label column; unused by `number`. */
  x?: string;
  /** The numeric value column. */
  y: string;
}

/** A named query; one with a chart is a tile on the project's dashboard. */
export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  chart?: ChartSpec;
  updatedAt: string;
}
