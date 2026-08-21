import { useEffect, useState } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { StatusPill } from '@/shared/design-system/StatusPill';
import type { JobRun } from '../domain/entities';
import { deriveRunStatus, formatRunDuration, formatRunRows, formatRunTime, stateLabel } from '../domain/rules';

interface JobRunsTableProps {
  runs: JobRun[];
  selectedRunId?: string | null;
  onSelect?: (runId: string) => void;
  page: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  onClear: () => void;
  clearing?: boolean;
}

function formatEnded(run: JobRun): string {
  if (run.finishedAt) return new Date(run.finishedAt).toLocaleTimeString();
  if (run.state === 'running') return '(running)';
  if (run.state === 'queued') return '(queued)';
  return '—';
}

const COLUMNS = ['Job', 'Submitted', 'Started', 'Ended', 'Duration', 'Status', 'Rows'];

const CONFIRM_TIMEOUT_MS = 4000;

/** Clicking once arms a confirm state (auto-disarms after a few seconds);
 * clicking again while armed actually clears. Avoids a native confirm()
 * dialog, which would look out of place next to the app's own controls. */
function ClearHistoryButton({ onClear, clearing }: { onClear: () => void; clearing?: boolean }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <button
      type="button"
      disabled={clearing}
      className="text-[13px] font-semibold"
      style={{
        background: 'none',
        border: 'none',
        cursor: clearing ? 'default' : 'pointer',
        padding: 0,
        color: confirming ? 'var(--danger)' : 'var(--text-muted)',
      }}
      onClick={() => {
        if (confirming) {
          setConfirming(false);
          onClear();
        } else {
          setConfirming(true);
        }
      }}
    >
      {clearing ? 'Clearing…' : confirming ? 'Confirm clear?' : 'Clear history'}
    </button>
  );
}

export function JobRunsTable({
  runs,
  selectedRunId,
  onSelect,
  page,
  hasMore,
  onPageChange,
  onClear,
  clearing,
}: JobRunsTableProps) {
  return (
    <Panel>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>Run History</h3>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>Page {page + 1}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 text-[13px]" style={{ color: 'var(--text-muted)' }}>
            <button
              type="button"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
              style={{
                background: 'none',
                border: 'none',
                cursor: page === 0 ? 'default' : 'pointer',
                opacity: page === 0 ? 0.35 : 1,
                padding: 0,
                color: 'inherit',
              }}
            >
              ←
            </button>
            <button
              type="button"
              disabled={!hasMore}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
              style={{
                background: 'none',
                border: 'none',
                cursor: hasMore ? 'pointer' : 'default',
                opacity: hasMore ? 1 : 0.35,
                padding: 0,
                color: 'inherit',
              }}
            >
              →
            </button>
          </div>
          <ClearHistoryButton onClear={onClear} clearing={clearing} />
        </div>
      </header>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse">
          <thead>
            <tr style={{ background: 'var(--surface-sunken)' }}>
              {COLUMNS.map((h) => (
                <th key={h} className="text-left" style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td className="px-3.5 py-3 text-[13px]" style={{ color: 'var(--text-muted)' }} colSpan={COLUMNS.length}>
                  No runs yet.
                </td>
              </tr>
            )}
            {runs.map((run) => (
              <tr
                key={run.id}
                className={onSelect ? 'os-selectable cursor-pointer' : undefined}
                aria-selected={run.id === selectedRunId}
                onClick={onSelect ? () => onSelect(run.id) : undefined}
              >
                <td className="os-font-mono px-3.5 py-3 text-[13px] font-semibold" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  {run.jobType}
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-3 text-[13px]"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}
                >
                  {formatRunTime(run.submittedAt)}
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-3 text-[13px]"
                  style={{ borderTop: '1px solid var(--border-subtle)', color: run.startedAt ? undefined : 'var(--text-subtle)' }}
                >
                  {formatRunTime(run.startedAt)}
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-3 text-[13px]"
                  style={{
                    borderTop: '1px solid var(--border-subtle)',
                    color: run.finishedAt ? undefined : 'var(--warning)',
                  }}
                >
                  {formatEnded(run)}
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-3 text-[13px]"
                  style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                >
                  {formatRunDuration(run.startedAt, run.finishedAt, run.state)}
                </td>
                <td className="px-3.5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <StatusPill status={deriveRunStatus(run.state)}>{stateLabel(run.state)}</StatusPill>
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-3 text-[13px]"
                  style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                >
                  {formatRunRows(run.rowsProcessed)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
