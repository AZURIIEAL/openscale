import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/shared/design-system/Badge';
import { Panel } from '@/shared/design-system/Panel';
import { Spinner } from '@/shared/design-system/Spinner';
import { SegmentedToggle } from '@/shared/design-system/SegmentedToggle';
import { Well } from '@/shared/design-system/Well';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { projectPath } from '@/shared/project/rules';
import { ResultsTable } from '@/domains/sql-editor/ui/ResultsTable';
import { isQueryError } from '@/domains/sql-editor/domain/rules';
import { formatBytes } from '@/domains/data-catalog/domain/rules';
import { useAddDatasetFile, useDatasetPreview, useDatasetProfile, useDeleteDataset } from '../application/useDatasets';
import { formatNullShare, formatRows, formatStat, isSupportedFilename, profileWarnings, sourceLabel, statusLabel, statusTone } from '../domain/rules';
import type { Dataset } from '../domain/entities';

type Tab = 'columns' | 'preview' | 'profile';

interface DatasetDetailProps {
  dataset: Dataset;
  onClose: () => void;
}

/** One dataset: schema, a 20-row preview, the column profile, plus
 * add-file, open-in-SQL and delete. */
export function DatasetDetail({ dataset, onClose }: DatasetDetailProps) {
  const [tab, setTab] = useState<Tab>('columns');
  const navigate = useNavigate();
  const { slug } = useCurrentProject();
  const addFile = useAddDatasetFile();
  const remove = useDeleteDataset();
  const fileInput = useRef<HTMLInputElement>(null);
  const ready = dataset.status === 'ready';

  function openInSql() {
    navigate(projectPath(slug, 'sql-editor'), { state: { prefillSql: `select *\nfrom ${dataset.name}\nlimit 20;` } });
  }

  function onPickFile(file: File | undefined) {
    if (!file) return;
    if (!isSupportedFilename(file.name)) return;
    addFile.mutate({ name: dataset.name, input: { file } });
  }

  function onDelete() {
    if (!window.confirm(`Delete dataset "${dataset.name}" and its files? This cannot be undone.`)) return;
    remove.mutate(dataset.name, { onSuccess: onClose });
  }

  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="os-font-mono m-0 truncate text-[15px] font-semibold" style={{ color: 'var(--text-heading)' }}>
              {dataset.name}
            </h3>
            <Badge tone="neutral">{dataset.layer}</Badge>
            <Badge tone={statusTone(dataset.status)} dot>
              {statusLabel(dataset.status)}
            </Badge>
          </div>
          <p className="os-font-mono m-0 mt-1 truncate text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            {sourceLabel(dataset)}
          </p>
          <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {formatRows(dataset.rowCount)} rows · {dataset.columns.length} columns · {dataset.sizeBytes !== undefined ? formatBytes(dataset.sizeBytes) : '—'}
          </p>
          {dataset.error && (
            <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--danger)' }}>
              {dataset.error}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInput} type="file" hidden onChange={(e) => onPickFile(e.target.files?.[0])} />
          <ActionButton onClick={() => fileInput.current?.click()} disabled={addFile.isPending}>
            {addFile.isPending ? 'Uploading…' : 'Add file'}
          </ActionButton>
          <ActionButton onClick={openInSql} disabled={!ready}>
            Open in SQL
          </ActionButton>
          <ActionButton onClick={onDelete} disabled={remove.isPending} danger>
            Delete
          </ActionButton>
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
      </div>

      <SegmentedToggle<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'columns', label: 'Columns' },
          { value: 'preview', label: 'Preview' },
          { value: 'profile', label: 'Profile' },
        ]}
      />

      {tab === 'columns' && <ColumnsTab dataset={dataset} />}
      {tab === 'preview' && (ready ? <PreviewTab name={dataset.name} /> : <NotReady />)}
      {tab === 'profile' && (ready ? <ProfileTab name={dataset.name} /> : <NotReady />)}
    </Panel>
  );
}

function ActionButton({ children, onClick, disabled, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="os-well rounded-lg px-3 py-1.5 text-[12.5px]"
      style={{ border: 'none', cursor: disabled ? 'default' : 'pointer', color: danger ? 'var(--danger)' : 'var(--text-body)', opacity: disabled ? 0.6 : 1 }}
    >
      {children}
    </button>
  );
}

function NotReady() {
  return (
    <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>
      Available once the dataset is ready.
    </p>
  );
}

function ColumnsTab({ dataset }: { dataset: Dataset }) {
  if (dataset.columns.length === 0) {
    return (
      <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        The schema is inferred during ingest.
      </p>
    );
  }
  return (
    <Well className="flex flex-col gap-1 px-4 py-3">
      {dataset.columns.map((c) => (
        <div key={c.name} className="flex items-center justify-between gap-3">
          <span className="os-font-mono truncate text-[12px]" style={{ color: 'var(--text-body)' }}>
            {c.name}
          </span>
          <span className="os-font-mono flex-shrink-0 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            {c.type}
          </span>
        </div>
      ))}
    </Well>
  );
}

function PreviewTab({ name }: { name: string }) {
  const { data, isLoading, isError } = useDatasetPreview(name, 20);
  if (isLoading) return <Loading label="Loading preview…" />;
  if (isError || !data) return <ErrorLine text="Could not load the preview." />;
  if (isQueryError(data)) return <ErrorLine text={data.error} />;
  return <ResultsTable result={data} />;
}

function ProfileTab({ name }: { name: string }) {
  const { data, isLoading, isError } = useDatasetProfile(name);
  if (isLoading) return <Loading label="Profiling columns…" />;
  if (isError || !data) return <ErrorLine text="Could not load the profile." />;
  if (data.error) return <ErrorLine text={data.error} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr className="os-font-mono text-left text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-subtle)' }}>
            <th className="py-1 pr-3">Column</th>
            <th className="py-1 pr-3">Type</th>
            <th className="py-1 pr-3 text-right">Nulls</th>
            <th className="py-1 pr-3 text-right">Distinct</th>
            <th className="py-1 pr-3">Min</th>
            <th className="py-1 pr-3">Max</th>
            <th className="py-1 pr-3 text-right">Mean</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {data.columns.map((c) => {
            const warnings = profileWarnings(c, data.rowCount);
            return (
              <tr key={c.name} style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-body)' }}>
                <td className="os-font-mono py-1 pr-3">{c.name}</td>
                <td className="os-font-mono py-1 pr-3" style={{ color: 'var(--text-subtle)' }}>
                  {c.type}
                </td>
                <td className="os-tabular-nums py-1 pr-3 text-right">{formatNullShare(c.nullShare)}</td>
                <td className="os-tabular-nums py-1 pr-3 text-right">{c.distinct ?? '—'}</td>
                <td className="os-font-mono py-1 pr-3">{formatStat(c.min)}</td>
                <td className="os-font-mono py-1 pr-3">{formatStat(c.max)}</td>
                <td className="os-tabular-nums py-1 pr-3 text-right">{formatStat(c.mean)}</td>
                <td className="py-1">{warnings.length > 0 && <Badge tone="warning">{warnings.join(', ')}</Badge>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
      <Spinner /> {label}
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="m-0 text-[12px]" style={{ color: 'var(--danger)' }}>
      {text}
    </p>
  );
}
