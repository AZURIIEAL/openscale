import { useState } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import { Spinner } from '@/shared/design-system/Spinner';
import { useCatalog } from '@/domains/sql-editor/application/useCatalog';
import { qualifiedTableName } from '@/domains/sql-editor/domain/rules';
import { ResultsTable } from '@/domains/sql-editor/ui/ResultsTable';
import type { CatalogTable } from '@/domains/sql-editor/domain/entities';
import { useTablePreview } from '../application/useTablePreview';

/** One expandable table row -- columns render immediately (already part of
 * the catalog fetch), row count + a 20-row sample are fetched on demand via
 * useTablePreview only when the row is first expanded, never eagerly for
 * every table on load. */
function TableRow({ table }: { table: CatalogTable }) {
  const [expanded, setExpanded] = useState(false);
  const preview = useTablePreview();
  const name = qualifiedTableName(table.schema, table.table);

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !preview.data && !preview.isPending) {
      preview.mutate({ schema: table.schema, table: table.table });
    }
  }

  return (
    <Well className="flex flex-col gap-2 px-4 py-3">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
        className="flex w-full items-center justify-between gap-2 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span style={{ color: 'var(--text-subtle)', fontSize: 10 }}>{expanded ? '▾' : '▸'}</span>
          <span className="os-font-mono truncate text-[13px] font-semibold" style={{ color: 'var(--text-body)' }}>
            {name}
          </span>
        </span>
        <span className="os-font-mono flex-shrink-0 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          {table.columns.length} column{table.columns.length === 1 ? '' : 's'}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3">
          <div className="ml-5 flex flex-col gap-0.5 border-l pl-3" style={{ borderColor: 'var(--border-subtle)' }}>
            {table.columns.map((col) => (
              <div key={col.name} className="flex items-center justify-between gap-2">
                <span className="os-font-mono truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {col.name}
                </span>
                <span className="os-font-mono flex-shrink-0 text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                  {col.type}
                </span>
              </div>
            ))}
          </div>

          {preview.isPending ? (
            <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              <Spinner /> Loading preview…
            </div>
          ) : preview.isError ? (
            <div className="text-[12px]" style={{ color: 'var(--danger)' }}>
              Failed to load preview.
            </div>
          ) : preview.data ? (
            <div className="flex flex-col gap-2">
              <span className="os-font-mono os-tabular-nums text-[12px]" style={{ color: 'var(--text-muted)' }}>
                {preview.data.rowCount !== null ? `${preview.data.rowCount.toLocaleString()} rows total` : (preview.data.rowCountError ?? 'Row count unavailable')}
              </span>
              {preview.data.sample ? (
                <ResultsTable result={preview.data.sample} />
              ) : (
                <div className="text-[12px]" style={{ color: 'var(--danger)' }}>
                  {preview.data.sampleError ?? 'Sample unavailable.'}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Well>
  );
}

/** Postgres side of the Data Catalog -- reuses the SQL Editor's schema
 * catalog (useCatalog / GET /api/query/catalog) directly rather than
 * duplicating the fetch, so Gold aggregates, the feature table, and job
 * history always match what the SQL Editor's own schema browser shows. */
export function PostgresTablesPanel() {
  const { data, isLoading, isError } = useCatalog();

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="os-font-mono m-0 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-subtle)' }}>
          Postgres Tables
        </h3>
        <p className="m-0 mt-1.5 text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>
          Gold aggregates, the feature table, and job history -- live from the database's real schema. Expand a table for its row
          count and a 20-row sample.
        </p>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <Spinner /> Loading schema…
        </div>
      ) : isError || !data ? (
        <div className="text-[12px]" style={{ color: 'var(--danger)' }}>
          Failed to load schema. Is the control-plane running?
        </div>
      ) : data.length === 0 ? (
        <div className="text-[12px]" style={{ color: 'var(--text-subtle)' }}>
          No tables yet -- run jobs from Pipelines to populate Gold and feature tables.
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: 520 }}>
          {data.map((table) => (
            <TableRow key={`${table.schema}.${table.table}`} table={table} />
          ))}
        </div>
      )}
    </Panel>
  );
}
