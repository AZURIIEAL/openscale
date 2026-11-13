import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { RunButton } from '@/shared/design-system/RunButton';
import { ProgressMeter } from '@/shared/design-system/ProgressMeter';
import { SegmentedToggle } from '@/shared/design-system/SegmentedToggle';
import { useCreateDatasetFromUrl, useUploadDataset } from '../application/useDatasets';
import { isSupportedFilename, isValidDatasetName, nameFromFilename, SUPPORTED_EXTENSIONS } from '../domain/rules';
import type { DatasetLayer } from '../domain/entities';

type Mode = 'upload' | 'url';

const inputClass = 'os-well rounded-lg px-3 py-2 text-[13px] w-full';
const inputStyle = { background: 'transparent', border: 'none', color: 'var(--text-body)', outline: 'none' } as const;
const labelClass = 'os-font-mono text-[10.5px] uppercase tracking-[0.06em]';

interface AddDatasetDialogProps {
  onClose: () => void;
  onCreated: (name: string) => void;
}

/**
 * Two ways in: a file from disk (CSV, TSV, Parquet or JSON, optionally
 * gzipped) streamed to the lake with a progress bar, or a URL the worker
 * downloads. Either way the dataset shows up in the list as "ingesting"
 * and flips to "ready" when the worker is done.
 */
export function AddDatasetDialog({ onClose, onCreated }: AddDatasetDialogProps) {
  const [mode, setMode] = useState<Mode>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [layer, setLayer] = useState<DatasetLayer>('bronze');
  const [progress, setProgress] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = useUploadDataset();
  const fromUrl = useCreateDatasetFromUrl();
  const pending = upload.isPending || fromUrl.isPending;
  const error = upload.error ?? fromUrl.error;

  const suggested = mode === 'upload' ? (file ? nameFromFilename(file.name) : '') : url ? nameFromFilename(url.split('?')[0]) : '';
  const effectiveName = nameTouched ? name : suggested;
  const nameOk = isValidDatasetName(effectiveName);
  const fileOk = file !== null && isSupportedFilename(file.name);
  const canSubmit = !pending && nameOk && (mode === 'upload' ? fileOk : url.trim().length > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const done = (res: { dataset: { name: string } }) => onCreated(res.dataset.name);
    if (mode === 'upload' && file) {
      setProgress(0);
      upload.mutate({ file, name: effectiveName, layer, onProgress: setProgress }, { onSuccess: done, onSettled: () => setProgress(null) });
    } else {
      fromUrl.mutate({ url: url.trim(), name: effectiveName, layer }, { onSuccess: done });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} role="dialog" aria-modal="true" aria-label="Add data">
      <Panel className="flex w-full max-w-lg flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={labelClass} style={{ color: 'var(--text-subtle)' }}>
              Data Catalog
            </span>
            <h2 className="m-0 mt-1 text-lg" style={{ color: 'var(--text-heading)' }}>
              Add data
            </h2>
          </div>
          <SegmentedToggle<Mode>
            value={mode}
            onChange={setMode}
            items={[
              { value: 'upload', label: 'Upload a file' },
              { value: 'url', label: 'From a URL' },
            ]}
          />
        </div>

        <form className="flex flex-col gap-3" onSubmit={submit}>
          {mode === 'upload' ? (
            <label className="flex flex-col gap-1">
              <span className={labelClass} style={{ color: 'var(--text-subtle)' }}>
                File
              </span>
              <input
                ref={fileInput}
                type="file"
                accept={SUPPORTED_EXTENSIONS.join(',')}
                className="text-[13px]"
                style={{ color: 'var(--text-body)' }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={pending}
              />
              <span className="text-[12px]" style={{ color: file && !fileOk ? 'var(--danger)' : 'var(--text-muted)' }}>
                {file && !fileOk ? 'Unsupported type. ' : ''}CSV, TSV, Parquet or JSON lines; .gz is fine.
              </span>
            </label>
          ) : (
            <label className="flex flex-col gap-1">
              <span className={labelClass} style={{ color: 'var(--text-subtle)' }}>
                URL
              </span>
              <input
                className={`${inputClass} os-font-mono`}
                style={inputStyle}
                type="url"
                placeholder="https://example.com/export.csv"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={pending}
                spellCheck={false}
                autoFocus
              />
              <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                The worker downloads it; public http(s) addresses only.
              </span>
            </label>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass} style={{ color: 'var(--text-subtle)' }}>
                Name
              </span>
              <input
                className={`${inputClass} os-font-mono`}
                style={inputStyle}
                value={effectiveName}
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
                placeholder="derived from the file name"
                maxLength={63}
                spellCheck={false}
                disabled={pending}
              />
              <span className="text-[12px]" style={{ color: effectiveName && !nameOk ? 'var(--danger)' : 'var(--text-muted)' }}>
                {effectiveName && !nameOk ? 'lowercase letters, digits and underscores, starting with a letter' : 'This is the table name in SQL.'}
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass} style={{ color: 'var(--text-subtle)' }}>
                Layer
              </span>
              <select className={`${inputClass} os-font-mono`} style={inputStyle} value={layer} onChange={(e) => setLayer(e.target.value as DatasetLayer)} disabled={pending}>
                <option value="bronze">bronze</option>
                <option value="silver">silver</option>
                <option value="gold">gold</option>
              </select>
            </label>
          </div>

          {progress !== null && (
            <ProgressMeter value={Math.round(progress * 100)} leftLabel="Uploading" rightLabel={`${Math.round(progress * 100)}%`} />
          )}

          {error && (
            <p className="m-0 text-[13px]" style={{ color: 'var(--danger)' }}>
              {error instanceof Error ? error.message : 'Could not add the dataset.'}
            </p>
          )}

          <div className="flex items-center gap-3">
            <RunButton type="submit" disabled={!canSubmit}>
              {pending ? (mode === 'upload' ? 'Uploading…' : 'Queuing…') : mode === 'upload' ? 'Upload' : 'Fetch'}
            </RunButton>
            <button type="button" className="text-[13px] underline" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={onClose} disabled={pending}>
              Cancel
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
