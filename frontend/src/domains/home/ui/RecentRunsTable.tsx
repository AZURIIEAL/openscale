import { Panel } from '@/shared/design-system/Panel';
import { StatusPill } from '@/shared/design-system/StatusPill';
import { formatRunRows } from '@/domains/pipelines/domain/rules';
import type { PipelineRunSummary } from '../domain/entities';

export function RecentRunsTable({ runs }: { runs: PipelineRunSummary[] }) {
  return (
    <Panel>
      <header>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>Recent Runs</h3>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>Last five pipeline jobs</p>
      </header>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr style={{ background: 'var(--surface-sunken)' }}>
              {['Job', 'Started', 'Duration', 'Status', 'Rows'].map((h) => (
                <th key={h} className="text-left" style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="os-font-mono px-3.5 py-3 text-[13px] font-semibold" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  {run.jobName}
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-3 text-[13px]"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}
                >
                  {run.startedAt}
                </td>
                <td
                  className="os-font-mono os-tabular-nums px-3.5 py-3 text-[13px]"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}
                >
                  {run.durationLabel}
                </td>
                <td className="px-3.5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <StatusPill status={run.status}>{run.status === 'good' ? 'success' : 'partial'}</StatusPill>
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
