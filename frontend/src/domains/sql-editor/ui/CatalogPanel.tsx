import { useState } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { Spinner } from '@/shared/design-system/Spinner';
import { useCatalog } from '../application/useCatalog';
import { qualifiedTableName } from '../domain/rules';
import type { CatalogTable } from '../domain/entities';

function TableRow({ table, onInsert }: { table: CatalogTable; onInsert: (text: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const name = qualifiedTableName(table.schema, table.table);

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? `Collapse ${name} columns` : `Expand ${name} columns`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-subtle)', fontSize: 10 }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <button
          type="button"
          className="os-font-mono min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-body)' }}
          onClick={() => onInsert(name)}
          title={`Insert "${name}" into the editor`}
        >
          {name}
        </button>
      </div>
      {expanded && (
        <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l pl-3" style={{ borderColor: 'var(--border-subtle)' }}>
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
      )}
    </div>
  );
}

/** Schema browser -- lists every real, live queryable table (see
 * control-plane's GET /api/query/catalog), grouped implicitly by whatever
 * order the backend returns (schema, then table). Clicking a table name
 * inserts it into the editor at the cursor. */
export function CatalogPanel({ onInsertTable }: { onInsertTable: (text: string) => void }) {
  const { data, isLoading, isError } = useCatalog();

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="os-font-mono m-0 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-subtle)' }}>
          Schema
        </h3>
        <p className="m-0 mt-1.5 text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>
          Postgres only, for now -- Bronze/Silver Parquet on the lake isn't queryable from here yet.
        </p>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <Spinner /> Loading schema…
        </div>
      ) : isError ? (
        <div className="text-[12px]" style={{ color: 'var(--danger)' }}>
          Failed to load schema. Is the control-plane running?
        </div>
      ) : !data || data.length === 0 ? (
        <div className="text-[12px]" style={{ color: 'var(--text-subtle)' }}>
          No tables yet -- run jobs from Pipelines to populate Gold and feature tables.
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: 420 }}>
          {data.map((table) => (
            <TableRow key={`${table.schema}.${table.table}`} table={table} onInsert={onInsertTable} />
          ))}
        </div>
      )}
    </Panel>
  );
}
