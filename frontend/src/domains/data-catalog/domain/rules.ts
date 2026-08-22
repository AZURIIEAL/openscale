/** Adaptive-unit byte formatter for lake object sizes -- unlike
 * home/domain/rules.ts's formatGiB (host-memory-scale, always GiB), lake
 * objects range from a few KB (a single quarantine file) to tens of MB (a
 * month of Bronze), so a fixed GiB unit would render as "0.0 GB" for nearly
 * everything. Binary (1024-based) units, matching the same Docker/cgroup
 * convention formatGiB documents. */
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 ? 0 : value < 10 ? 2 : 1;
  return `${value.toFixed(decimals)} ${UNITS[exponent]}`;
}

/** Display text for a lake object's last-modified timestamp -- locale time,
 * matching how job-run timestamps render elsewhere in this app rather than
 * a raw ISO string. */
export function formatLastModified(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** "public" tables read naturally unqualified; anything else needs its
 * schema prefix to be a valid, quoted reference -- mirrors sql-editor's
 * qualifiedTableName but double-quotes both parts, since some of this
 * repo's real table/column names are mixed-case (e.g. zone_hour_features'
 * "PULocationID") and need quoting to round-trip correctly through SQL,
 * not just for display. */
export function quotedTableRef(schema: string, table: string): string {
  return `"${schema}"."${table}"`;
}
