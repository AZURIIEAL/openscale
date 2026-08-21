import type { RefObject } from 'react';
import { RunButton } from '@/shared/design-system/RunButton';
import { Spinner } from '@/shared/design-system/Spinner';

interface QueryEditorProps {
  sql: string;
  onChange: (sql: string) => void;
  onRun: () => void;
  onClear: () => void;
  pending: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/**
 * Plain <textarea>, not a code-editor library (Monaco/CodeMirror) -- this
 * app hand-rolls every component and a full editor library would be the
 * only third-party UI dependency in the codebase for one screen.
 */
export function QueryEditor({ sql, onChange, onRun, onClear, pending, textareaRef }: QueryEditorProps) {
  const canRun = !pending && sql.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      <textarea
        ref={textareaRef}
        className="os-well os-font-mono w-full resize-y rounded-lg px-4 py-3 text-[13px] leading-relaxed"
        style={{ minHeight: 160, color: 'var(--text-body)', outline: 'none', border: 'none' }}
        placeholder={'select job_type, status, submitted_at\nfrom control_plane.job_runs\norder by submitted_at desc\nlimit 20;'}
        spellCheck={false}
        value={sql}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (canRun) onRun();
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="os-font-mono text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          Ctrl/Cmd + Enter to run
        </span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={pending || sql.length === 0}
            className="text-[13px] font-semibold"
            style={{
              background: 'none',
              border: 'none',
              cursor: pending || sql.length === 0 ? 'default' : 'pointer',
              padding: 0,
              color: 'var(--text-muted)',
              opacity: pending || sql.length === 0 ? 0.5 : 1,
            }}
            onClick={onClear}
          >
            Clear
          </button>
          <RunButton disabled={!canRun} onClick={onRun}>
            {pending ? (
              <span className="flex items-center gap-2">
                <Spinner /> Running…
              </span>
            ) : (
              'Run'
            )}
          </RunButton>
        </div>
      </div>
    </div>
  );
}
