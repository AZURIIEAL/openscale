import { Panel } from '@/shared/design-system/Panel';
import { StatusPill } from '@/shared/design-system/StatusPill';
import { formatRunRows } from '@/domains/pipelines/domain/rules';
import type { PipelineRunSummary } from '../domain/entities';

export function RecentRunsTable({ runs }: { runs: PipelineRunSummary[] }) {
  return (
    <div>
      <div className="os-font-mono mb-2.5 ml-0.5 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-muted)' }}>
        Recent runs
      </div>
      <Panel className="overflow-x-auto p-1.5">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              {['Job', 'Started', 'Duration', 'Status', 'Rows'].map((h) => (
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
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="os-font-mono px-3.5 py-2.5 text-[13px]" style={{ borderTop: '1px solid var(--hairline)' }}>
                  {run.jobName}
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-2.5 text-[13px]"
                  style={{ borderTop: '1px solid var(--hairline)' }}
                >
                  {run.startedAt}
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-2.5 text-[13px]"
                  style={{ borderTop: '1px solid var(--hairline)' }}
                >
                  {run.durationLabel}
                </td>
                <td className="px-3.5 py-2.5" style={{ borderTop: '1px solid var(--hairline)' }}>
                  <StatusPill status={run.status}>{run.status === 'good' ? 'success' : 'partial'}</StatusPill>
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
