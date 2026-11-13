import type { Dataset, DatasetStatus, ProfileColumn } from './entities';

export const SUPPORTED_EXTENSIONS = ['.csv', '.tsv', '.parquet', '.json', '.jsonl', '.ndjson', '.csv.gz', '.tsv.gz', '.json.gz'];

/** Mirrors datasets.IsSupportedFilename on the control-plane. */
export function isSupportedFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Mirrors datasets.NameFromFilename: strip extension(s), lowercase,
 * non-identifier runs to "_", ensure a leading letter, cap at 63. */
export function nameFromFilename(filename: string): string {
  let base = filename.replace(/\\/g, '/').split('/').pop() ?? '';
  base = base.replace(/\.[^.]*$/, '').replace(/\.[^.]*$/, '');
  let name = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (name === '') return 'dataset';
  if (/^[0-9]/.test(name)) name = `d_${name}`;
  if (name.length > 63) name = name.slice(0, 63).replace(/_+$/, '');
  return name;
}

/** Mirrors the server's name rule (a SQL identifier). */
export function isValidDatasetName(name: string): boolean {
  return /^[a-z][a-z0-9_]{0,62}$/.test(name);
}

export function statusTone(status: DatasetStatus): 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'ready':
      return 'success';
    case 'failed':
      return 'danger';
    default:
      return 'warning';
  }
}

export function statusLabel(status: DatasetStatus): string {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'failed':
      return 'failed';
    default:
      return 'ingesting';
  }
}

export function formatRows(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString();
}

export function formatNullShare(share: number): string {
  if (share === 0) return '0%';
  if (share < 0.001) return '<0.1%';
  return `${(share * 100).toFixed(1)}%`;
}

export function formatStat(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 37)}…` : s;
}

/** Columns worth flagging in a profile: fully null or constant. */
export function profileWarnings(c: ProfileColumn, rowCount: number): string[] {
  const out: string[] = [];
  if (rowCount > 0 && c.nullCount >= rowCount) out.push('all null');
  else if (rowCount > 0 && c.distinct === 1) out.push('constant');
  else if (c.nullShare >= 0.5) out.push('mostly null');
  return out;
}

export function sourceLabel(ds: Dataset): string {
  if (ds.source.kind === 'url') return ds.source.url ?? 'url';
  return ds.source.filename ? `upload · ${ds.source.filename}` : 'upload';
}

/** A dataset that is still ingesting should be polled. */
export function hasPendingDataset(datasets: Dataset[] | undefined): boolean {
  return (datasets ?? []).some((d) => d.status === 'pending');
}
