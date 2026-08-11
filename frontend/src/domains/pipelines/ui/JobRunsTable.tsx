import { Panel } from '@/shared/design-system/Panel';
import { StatusPill } from '@/shared/design-system/StatusPill';
import type { JobRun } from '../domain/entities';
import { deriveRunStatus, stateLabel } from '../domain/rules';

interface JobRunsTableProps {
  runs: JobRun[];
  selectedRunId?: string | null;
  onSelect?: (runId: string) => void;
}

export function JobRunsTable({ runs, selectedRunId, onSelect }: JobRunsTableProps) {
  return (
    <div>
      <div className="os-font-mono mb-2.5 ml-0.5 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-muted)' }}>
        Run history
      </div>
      <Panel className="overflow-x-auto p-1.5">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              {['Job', 'Submitted', 'Status'].map((h) => (
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
                <td className="px-3.5 py-3 text-[13px]" style={{ color: 'var(--ink-muted)' }} colSpan={3}>
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
                  {new Date(run.submittedAt).toLocaleTimeString()}
                </td>
                <td className="px-3.5 py-2.5" style={{ borderTop: '1px solid var(--hairline)' }}>
                  <StatusPill status={deriveRunStatus(run.state)}>{stateLabel(run.state)}</StatusPill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
