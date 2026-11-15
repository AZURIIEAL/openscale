import { useState } from 'react';
import { useSaveQuery } from '../application/useSavedQueries';
import type { ChartSpec, ChartType } from '../domain/entities';

const inputClass = 'os-well rounded-lg px-2.5 py-1.5 text-[12.5px]';
const inputStyle = { background: 'transparent', border: 'none', color: 'var(--text-body)', outline: 'none' } as const;
const CHARTS: { value: ChartType | ''; label: string }[] = [
  { value: '', label: 'No chart' },
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bars' },
  { value: 'hbar', label: 'Ranked bars' },
  { value: 'number', label: 'Number' },
];

interface SaveQueryBarProps {
  sql: string;
  /** The last result's columns, offered for the chart's x and y. */
  columns: string[];
  /** The loaded saved query, if any: its name and chart prefill the bar. */
  initial?: { name: string; chart?: ChartSpec };
}

/** Save the editor's SQL under a name, optionally as a dashboard tile.
 * Saving an existing name replaces it. */
export function SaveQueryBar({ sql, columns, initial }: SaveQueryBarProps) {
  const save = useSaveQuery();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<ChartType | ''>(initial?.chart?.type ?? '');
  const [x, setX] = useState(initial?.chart?.x ?? '');
  const [y, setY] = useState(initial?.chart?.y ?? '');
  const options = [...new Set([...columns, x, y].filter(Boolean))];
  const chart: ChartSpec | undefined = type ? { type, x: type === 'number' ? undefined : x, y } : undefined;
  const ready = name.trim() && sql.trim() && (!type || (y && (type === 'number' || x)));

  const column = (label: string, value: string, set: (v: string) => void) => (
    <select className={inputClass} style={inputStyle} aria-label={label} value={value} onChange={(e) => set(e.target.value)}>
      <option value="">{label}…</option>
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} os-font-mono`}
          style={{ ...inputStyle, width: '12rem' }}
          aria-label="Saved query name"
          placeholder="query_name"
          spellCheck={false}
          autoCapitalize="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select className={inputClass} style={inputStyle} aria-label="Chart" value={type} onChange={(e) => setType(e.target.value as ChartType | '')}>
          {CHARTS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {type && type !== 'number' && column('X (labels)', x, setX)}
        {type && column('Y (values)', y, setY)}
        <button
          type="button"
          className="os-well rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
          style={{ border: 'none', cursor: ready ? 'pointer' : 'not-allowed', color: 'var(--text-body)', opacity: ready ? 1 : 0.5 }}
          disabled={!ready || save.isPending}
          onClick={() => save.mutate({ name: name.trim(), sql: sql.trim(), chart })}
        >
          {save.isPending ? 'Saving…' : 'Save query'}
        </button>
        {save.isSuccess && !save.isPending && (
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Saved{chart ? ' — on the Dashboards screen' : ''}
          </span>
        )}
      </div>
      {save.isError && (
        <p className="m-0 text-[12px]" style={{ color: 'var(--danger)' }}>
          {save.error.message.replace(/^\w+ \S+ failed: \d+ /, '')}
        </p>
      )}
    </div>
  );
}
