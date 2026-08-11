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
      className="os-font-mono text-[11px] font-semibold uppercase tracking-[0.06em]"
      style={{
        background: 'none',
        border: 'none',
        cursor: clearing ? 'default' : 'pointer',
        padding: 0,
        color: confirming ? 'var(--crit)' : 'var(--ink-muted)',
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
    <div>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="os-font-mono ml-0.5 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-muted)' }}>
          Run history
        </div>
        <div className="flex items-center gap-4">
          <div className="os-font-mono flex items-center gap-2.5 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
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
                fontSize: '13px',
                color: 'inherit',
              }}
            >
              ←
            </button>
            <span>Page {page + 1}</span>
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
                fontSize: '13px',
                color: 'inherit',
              }}
            >
              →
            </button>
          </div>
          <ClearHistoryButton onClear={onClear} clearing={clearing} />
        </div>
      </div>
      <Panel className="overflow-x-auto p-1.5">
        <table className="w-full min-w-[800px] border-collapse">
          <thead>
            <tr>
              {COLUMNS.map((h) => (
                <th
                  key={h}
                  className="os-font-mono px-3.5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td className="px-3.5 py-3 text-[13px]" style={{ color: 'var(--ink-muted)' }} colSpan={COLUMNS.length}>
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
                <td className="os-font-mono px-3.5 py-2.5 text-[13px]" style={{ borderTop: '1px solid var(--hairline)' }}>
                  {run.jobType}
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-2.5 text-[13px]"
                  style={{ borderTop: '1px solid var(--hairline)' }}
                >
                  {formatRunTime(run.submittedAt)}
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-2.5 text-[13px]"
                  style={{ borderTop: '1px solid var(--hairline)', color: run.startedAt ? undefined : 'var(--ink-faint)' }}
                >
                  {formatRunTime(run.startedAt)}
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-2.5 text-[13px]"
                  style={{
                    borderTop: '1px solid var(--hairline)',
                    color: run.finishedAt ? undefined : 'var(--warn)',
                  }}
                >
                  {formatEnded(run)}
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-2.5 text-[13px]"
                  style={{ borderTop: '1px solid var(--hairline)', color: 'var(--ink-muted)' }}
                >
                  {formatRunDuration(run.startedAt, run.finishedAt, run.state)}
                </td>
                <td className="px-3.5 py-2.5" style={{ borderTop: '1px solid var(--hairline)' }}>
                  <StatusPill status={deriveRunStatus(run.state)}>{stateLabel(run.state)}</StatusPill>
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-2.5 text-[13px]"
                  style={{ borderTop: '1px solid var(--hairline)', color: 'var(--ink-muted)' }}
                >
                  {formatRunRows(run.rowsProcessed)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
