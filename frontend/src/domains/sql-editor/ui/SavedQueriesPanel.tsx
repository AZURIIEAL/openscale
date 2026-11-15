import { Panel } from '@/shared/design-system/Panel';
import { useDeleteSavedQuery, useSavedQueries } from '../application/useSavedQueries';
import type { SavedQuery } from '../domain/entities';

interface SavedQueriesPanelProps {
  onSelect: (query: SavedQuery) => void;
}

/** The project's saved queries; click one to load it. A chart badge marks
 * the ones shown on the Dashboards screen. */
export function SavedQueriesPanel({ onSelect }: SavedQueriesPanelProps) {
  const saved = useSavedQueries();
  const remove = useDeleteSavedQuery();
  const list = saved.data ?? [];

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <h3 className="os-font-mono m-0 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-subtle)' }}>
        Saved queries
      </h3>
      {list.length === 0 ? (
        <p className="m-0 text-[12px] leading-snug" style={{ color: 'var(--text-subtle)' }}>
          Save a query to keep it for this project. Give it a chart to put it on the Dashboards screen.
        </p>
      ) : (
        <ul className="m-0 flex flex-col gap-1 overflow-y-auto p-0 pr-1" style={{ listStyle: 'none', maxHeight: 320 }}>
          {list.map((q) => (
            <li key={q.id} className="flex items-center gap-2">
              <button
                type="button"
                className="os-font-mono min-w-0 flex-1 truncate text-left text-[12px]"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', color: 'var(--text-body)' }}
                title={q.sql}
                onClick={() => onSelect(q)}
              >
                {q.name}
              </button>
              {q.chart && (
                <span className="os-font-mono text-[10px] uppercase" style={{ color: 'var(--text-subtle)' }}>
                  {q.chart.type}
                </span>
              )}
              <button
                type="button"
                aria-label={`Delete ${q.name}`}
                title="Delete"
                className="text-[11px]"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Delete saved query "${q.name}"?`)) remove.mutate(q.name);
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
