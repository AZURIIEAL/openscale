import { useRef, useState } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { useRunQuery } from '../application/useRunQuery';
import { useQueryHistory } from '../application/useQueryHistory';
import { isQueryError } from '../domain/rules';
import { CatalogPanel } from './CatalogPanel';
import { QueryHistoryPanel } from './QueryHistoryPanel';
import { QueryEditor } from './QueryEditor';
import { ResultsTable } from './ResultsTable';

const DEFAULT_SQL =
  'select job_type, status, submitted_at, rows_processed\nfrom control_plane.job_runs\norder by submitted_at desc\nlimit 20;';

/**
 * Real (this pass's scope): read-only SELECT/WITH queries against the
 * control-plane's Postgres database only -- job_runs plus whatever gold
 * tables and zone_hour_features the worker has written. Querying
 * Bronze/Silver Parquet on the lake directly (ideas/tech-stack.md's DuckDB
 * plan) is a separate, larger effort and explicitly not built yet -- the
 * copy below says so rather than implying it works.
 */
export function SqlEditorScreen() {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const runQuery = useRunQuery();
  const { entries, addEntry, clear } = useQueryHistory();

  const outcome = runQuery.data;
  const result = outcome && !isQueryError(outcome) ? outcome : undefined;
  const queryErrorMessage = outcome && isQueryError(outcome) ? outcome.error : undefined;

  function handleRun() {
    const trimmed = sql.trim();
    if (!trimmed) return;
    runQuery.mutate(trimmed, {
      onSuccess: (data) => {
        addEntry({
          sql: trimmed,
          ranAt: new Date().toISOString(),
          success: !isQueryError(data),
          rowCount: isQueryError(data) ? undefined : data.rowCount,
        });
      },
    });
  }

  // Inserts at the textarea's current cursor position (falling back to
  // appending if the ref isn't mounted yet), then refocuses the editor so
  // typing can continue immediately -- see CatalogPanel's table-name click.
  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    if (!el) {
      setSql((s) => (s ? `${s} ${text}` : text));
      return;
    }
    const start = el.selectionStart ?? sql.length;
    const end = el.selectionEnd ?? sql.length;
    const next = `${sql.slice(0, start)}${text}${sql.slice(end)}`;
    setSql(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + text.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      <div className="flex flex-col gap-4">
        <CatalogPanel onInsertTable={insertAtCursor} />
        <QueryHistoryPanel entries={entries} onSelect={setSql} onClear={clear} />
      </div>

      <div className="flex flex-col gap-4">
        <Panel className="flex flex-col gap-1 p-4">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>
            SQL Editor
          </h3>
          <p className="text-wrap-pretty" style={{ margin: '4px 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
            Read-only queries against the control-plane's Postgres database -- job history plus whatever Gold and
            feature tables the pipeline has written. Bronze/Silver Parquet on the lake isn't queryable from here yet.
          </p>
          <QueryEditor
            sql={sql}
            onChange={setSql}
            onRun={handleRun}
            onClear={() => setSql('')}
            pending={runQuery.isPending}
            textareaRef={textareaRef}
          />
        </Panel>

        {queryErrorMessage && (
          <Panel className="p-4">
            <span className="os-font-mono text-[13px]" style={{ color: 'var(--danger)' }}>
              {queryErrorMessage}
            </span>
          </Panel>
        )}

        {result && <ResultsTable result={result} />}

        {!result && !queryErrorMessage && (
          <Panel className="p-6 text-[13px]" style={{ color: 'var(--text-subtle)' }}>
            {runQuery.isPending ? 'Running query…' : 'Run a query to see results here.'}
          </Panel>
        )}
      </div>
    </div>
  );
}
