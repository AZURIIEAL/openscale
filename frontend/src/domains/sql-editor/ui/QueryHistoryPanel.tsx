import { Panel } from '@/shared/design-system/Panel';
import { StatusPill } from '@/shared/design-system/StatusPill';
import type { QueryHistoryEntry } from '../domain/entities';

function formatRanAt(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

interface QueryHistoryPanelProps {
  entries: QueryHistoryEntry[];
  onSelect: (sql: string) => void;
  onClear: () => void;
}

/** Client-side-only history (see application/useQueryHistory.ts) -- click
 * an entry to load it back into the editor. */
export function QueryHistoryPanel({ entries, onSelect, onClear }: QueryHistoryPanelProps) {
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="os-font-mono m-0 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-subtle)' }}>
          History
        </h3>
        {entries.length > 0 && (
          <button
            type="button"
            className="text-[11px] font-semibold"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}
            onClick={onClear}
          >
            Clear
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="m-0 text-[12px] leading-snug" style={{ color: 'var(--text-subtle)' }}>
          Queries you run appear here, kept in this browser only.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 overflow-y-auto pr-1" style={{ maxHeight: 320 }}>
          {entries.map((entry, i) => (
            <button
              key={i}
              type="button"
              className="os-well flex flex-col gap-1 rounded-lg px-3 py-2 text-left"
              style={{ border: 'none', cursor: 'pointer' }}
              onClick={() => onSelect(entry.sql)}
              title={entry.sql}
            >
              <span className="os-font-mono truncate text-[12px]" style={{ color: 'var(--text-body)' }}>
                {entry.sql}
              </span>
              <div className="flex items-center gap-2">
                <StatusPill status={entry.success ? 'good' : 'crit'}>{entry.success ? 'ok' : 'error'}</StatusPill>
                <span className="os-font-mono text-[10.5px]" style={{ color: 'var(--text-subtle)' }}>
                  {formatRanAt(entry.ranAt)}
                  {entry.success && entry.rowCount !== undefined ? ` · ${entry.rowCount.toLocaleString()} rows` : ''}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}
