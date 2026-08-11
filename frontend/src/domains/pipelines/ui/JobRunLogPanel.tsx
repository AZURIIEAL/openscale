import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import { StatusPill } from '@/shared/design-system/StatusPill';
import { Spinner } from '@/shared/design-system/Spinner';
import { useJobRunEvents } from '../application/useJobRunEvents';
import { deriveRunStatus, stateLabel } from '../domain/rules';

export function JobRunLogPanel({ jobId }: { jobId: string }) {
  const { state, logLines } = useJobRunEvents(jobId);
  const isLive = state === 'queued' || state === 'running';

  return (
    <Panel className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center justify-between">
        <span
          className="os-font-mono flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em]"
          style={{ color: 'var(--ink-muted)' }}
        >
          {isLive && <Spinner />}
          {isLive ? 'Live run' : 'Run log'}
        </span>
        {state && <StatusPill status={deriveRunStatus(state)}>{stateLabel(state)}</StatusPill>}
      </div>
      <Well className="max-h-[220px] overflow-y-auto p-3">
        {logLines.length === 0 ? (
          <span className="os-font-mono text-[12px]" style={{ color: 'var(--ink-faint)' }}>
            Waiting for output…
          </span>
        ) : (
          logLines.map((line, i) => (
            <div key={i} className="os-font-mono text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
              {line}
            </div>
          ))
        )}
      </Well>
    </Panel>
  );
}
