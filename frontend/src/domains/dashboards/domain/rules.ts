export function formatCurrency(value: number | undefined): string {
  if (value === undefined) return '—';
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatCount(value: number | undefined): string {
  if (value === undefined) return '—';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function formatPercent(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(1)}%`;
}

/** Short date label for chart axes, e.g. "Jul 14". */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** 0-23 -> "12 AM", "1 PM", etc. */
export function formatHourLabel(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${period}`;
}

export function formatDurationSeconds(seconds: number | undefined): string {
  if (seconds === undefined) return '—';
  const rounded = Math.round(seconds);
  return rounded < 60 ? `${rounded}s` : `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
}

/** A saved query's result as chart points: x labels the point, y must be a
 * number (rows where it isn't are dropped). Throws, naming the column, when
 * x or y isn't in the result, so the tile can say what to fix. */
export function chartPoints(
  result: { columns: string[]; rows: unknown[][] },
  chart: { x?: string; y: string },
): { label: string; value: number }[] {
  const yi = result.columns.indexOf(chart.y);
  const xi = chart.x ? result.columns.indexOf(chart.x) : -1;
  if (yi < 0) throw new Error(`column "${chart.y}" is not in the result`);
  if (chart.x && xi < 0) throw new Error(`column "${chart.x}" is not in the result`);
  return result.rows.flatMap((row) => {
    const value = typeof row[yi] === 'number' ? row[yi] : Number(row[yi]);
    if (row[yi] === null || row[yi] === '' || !Number.isFinite(value)) return [];
    return [{ label: xi >= 0 ? String(row[xi] ?? '') : '', value }];
  });
}
