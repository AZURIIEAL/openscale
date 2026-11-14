import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Panel } from '@/shared/design-system/Panel';
import { useRunQuery } from '../application/useRunQuery';
import { useQueryTarget } from '../application/useQueryTarget';
import { useCatalog } from '../application/useCatalog';
import { useQueryHistory } from '../application/useQueryHistory';
import { isQueryError } from '../domain/rules';
import { CatalogPanel } from './CatalogPanel';
import { QueryHistoryPanel } from './QueryHistoryPanel';
import { QueryEditor } from './QueryEditor';
import { ResultsTable } from './ResultsTable';

const LEGACY_DEFAULT_SQL =
  'select job_type, status, submitted_at, rows_processed\nfrom control_plane.job_runs\norder by submitted_at desc\nlimit 20;';

/**
 * Read-only SELECT/WITH queries. In the taxi sample project they run
 * against the control-plane's Postgres (its Gold tables live there); in
 * every other project they run through the DuckDB query engine over the
 * project's own datasets, each exposed as a view named after it. The
 * default query is picked accordingly: a Postgres example, or `select *`
 * from the project's first dataset.
 */
/** A search result for a specific table (see shared/search) lands here
 * with a ready-to-run SELECT already filled in, via react-router
 * navigation state, read once on mount. */
interface SqlEditorNavState {
  prefillSql?: string;
}

export function SqlEditorScreen() {
  const navState = useLocation().state as SqlEditorNavState | null;
  const target = useQueryTarget();
  const catalog = useCatalog();
  const firstTable = catalog.data?.[0];
  const defaultSql = target.legacy
    ? LEGACY_DEFAULT_SQL
    : firstTable
      ? `select *\nfrom ${firstTable.table}\nlimit 20;`
      : '-- Upload a dataset in the Data Catalog, then query it here by name.\nselect 1;';
  const [sql, setSql] = useState(navState?.prefillSql ?? defaultSql);
  // The dataset list arrives after first render; seed the default query
  // then, but only while the editor still holds the placeholder (never
  // over something the user typed).
  useEffect(() => {
    if (!target.legacy && firstTable) {
      setSql((current) => (current.startsWith('-- Upload a dataset') ? defaultSql : current));
    }
  }, [target.legacy, firstTable, defaultSql]);
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
