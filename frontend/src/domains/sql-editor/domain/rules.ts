import type { QueryError, QueryResult } from './entities';

export function isQueryError(result: QueryResult | QueryError): result is QueryError {
  return 'error' in result;
}

export function isNumericCell(value: unknown): boolean {
  return typeof value === 'number';
}

/** Display text for one result cell -- mirrors JobRunsTable/RecentRunsTable's
 * convention of a muted dash for "nothing here", except NULL gets its own
 * literal label rather than a blank: blank could be mistaken for an empty
 * string, which is a different SQL value than NULL. */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Raw (unrounded) text for one CSV cell -- export should preserve exact
 * values, unlike the table's rounded display text. */
function csvCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeCsvField(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** Builds an RFC4180-ish CSV string from a query result -- backs
 * ResultsTable's export button, entirely client-side. */
export function buildCsv(columns: string[], rows: unknown[][]): string {
  const lines = [columns.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvField(csvCellValue(cell))).join(','));
  }
  return lines.join('\r\n');
}

export function formatDurationMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

/** "public" tables read naturally unqualified; anything else (currently
 * just control_plane) needs its schema prefix to be a valid reference. */
export function qualifiedTableName(schema: string, table: string): string {
  return schema === 'public' ? table : `${schema}.${table}`;
}
