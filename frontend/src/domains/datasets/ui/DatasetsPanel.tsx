import { useState } from 'react';
import { Badge } from '@/shared/design-system/Badge';
import { Panel } from '@/shared/design-system/Panel';
import { RunButton } from '@/shared/design-system/RunButton';
import { Spinner } from '@/shared/design-system/Spinner';
import { Well } from '@/shared/design-system/Well';
import { formatBytes } from '@/domains/data-catalog/domain/rules';
import { useDatasets } from '../application/useDatasets';
import { formatRows, statusLabel, statusTone } from '../domain/rules';
import { AddDatasetDialog } from './AddDatasetDialog';
import { DatasetDetail } from './DatasetDetail';

/**
 * The project's datasets: upload or fetch one, see its status flip from
 * ingesting to ready, open it. Replaces the fixed Bronze/Silver/Gold lake
 * browser for every project except the taxi sample.
 */
export function DatasetsPanel() {
  const { data, isLoading, isError } = useDatasets();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedDataset = data?.find((d) => d.name === selected);

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="os-font-mono m-0 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-subtle)' }}>
              Datasets
            </h3>
            <p className="m-0 mt-1.5 text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>
              Each dataset is a table you can query by name in the SQL Editor. Files land in the lake as Parquet.
            </p>
          </div>
          <RunButton onClick={() => setAdding(true)}>Add data</RunButton>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            <Spinner /> Loading datasets…
          </div>
        ) : isError ? (
          <p className="m-0 text-[12px]" style={{ color: 'var(--danger)' }}>
            Failed to load datasets. Is the control-plane running?
          </p>
        ) : !data || data.length === 0 ? (
          <Well className="px-4 py-6 text-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
            No datasets yet. Upload a CSV or Parquet file, or point at a URL, to get started.
          </Well>
        ) : (
          <div className="flex flex-col gap-2">
            {data.map((ds) => (
              <button
                key={ds.id}
                type="button"
                onClick={() => setSelected(ds.name === selected ? null : ds.name)}
                className="os-well flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left"
                style={{ border: 'none', cursor: 'pointer', outline: ds.name === selected ? '2px solid var(--brand)' : 'none' }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="os-font-mono truncate text-[13px] font-semibold" style={{ color: 'var(--text-body)' }}>
                    {ds.name}
                  </span>
                  <Badge tone="neutral">{ds.layer}</Badge>
                  <Badge tone={statusTone(ds.status)} dot>
                    {statusLabel(ds.status)}
                  </Badge>
                </span>
                <span className="os-font-mono os-tabular-nums flex-shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {formatRows(ds.rowCount)} rows · {ds.columns.length} cols · {ds.sizeBytes !== undefined ? formatBytes(ds.sizeBytes) : '—'}
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {selectedDataset && <DatasetDetail dataset={selectedDataset} onClose={() => setSelected(null)} />}

      {adding && (
        <AddDatasetDialog
          onClose={() => setAdding(false)}
          onCreated={(name) => {
            setAdding(false);
            setSelected(name);
          }}
        />
      )}
    </div>
  );
}
