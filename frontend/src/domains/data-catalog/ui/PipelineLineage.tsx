import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import { StatusPill } from '@/shared/design-system/StatusPill';
import { JOB_CATALOG } from '@/domains/pipelines/domain/entities';
import { useJobRunsPage } from '@/domains/pipelines/application/useJobRuns';
import type { JobRun, JobState } from '@/domains/pipelines/domain/entities';

const RUN_STATUS_MAP: Record<JobState, { status: 'good' | 'warn' | 'crit'; label: string }> = {
  succeeded: { status: 'good', label: 'Succeeded' },
  partial: { status: 'warn', label: 'Partial' },
  running: { status: 'warn', label: 'Running' },
  queued: { status: 'warn', label: 'Queued' },
  failed: { status: 'crit', label: 'Failed' },
  cancelled: { status: 'crit', label: 'Cancelled' },
};

/** Finds the most recent run for jobType among the last 10 runs
 * system-wide (the same page useJobRunsPage(0) already fetches, ordered
 * newest-first by control-plane/internal/db.ListRuns). Absent means "not
 * among the 10 most recent runs" -- not "never run" -- so callers must
 * treat a miss as "no annotation available", never as a false claim the
 * stage has never executed. */
function latestRunFor(runs: JobRun[] | undefined, jobType: string): JobRun | undefined {
  return runs?.find((run) => run.jobType === jobType);
}

/**
 * Static, honest 5-stage flow diagram -- reuses pipelines/domain/entities
 * .ts's JOB_CATALOG directly (Bronze/Ingest -> Silver -> Gold -> Features,
 * with Train as a fifth downstream stage) rather than a second hardcoded
 * copy that could drift, and rather than any computed/discovered lineage:
 * this app doesn't track column-level or table-level lineage anywhere, so
 * inventing one here would be exactly the kind of fabricated relationship
 * this feature is meant to avoid. The optional "last run" badge is a real
 * read from job history (see latestRunFor's doc comment on its one
 * limitation), the flow structure itself never changes with it.
 */
export function PipelineLineage() {
  const { data } = useJobRunsPage(0);
  const runs = data?.runs;

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="os-font-mono m-0 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-subtle)' }}>
          Pipeline Lineage
        </h3>
        <p className="m-0 mt-1.5 text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>
          The real, fixed stage order every job runs in -- not a computed or discovered graph.
        </p>
      </div>
      <div className="flex flex-col gap-0">
        {JOB_CATALOG.map((job, i) => {
          const latestRun = latestRunFor(runs, job.type);
          const badge = latestRun ? RUN_STATUS_MAP[latestRun.state] : null;
          return (
            <div key={job.type} className="flex flex-col">
              <Well className="flex flex-wrap items-center gap-4 px-4 py-3">
                <span
                  className="os-font-mono flex-shrink-0"
                  style={{
                    fontSize: 11,
                    color: 'var(--text-subtle)',
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 999,
                    padding: '3px 8px',
                  }}
                >
                  {job.stage}
                </span>
                <div className="min-w-0 flex-1">
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-body)' }}>{job.label}</div>
                  <p className="text-wrap-pretty" style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
                    {job.description}
                  </p>
                </div>
                {badge && (
                  <div className="flex-none">
                    <StatusPill status={badge.status}>{badge.label}</StatusPill>
                  </div>
                )}
              </Well>
              {i < JOB_CATALOG.length - 1 && (
                <div className="flex justify-center py-0.5" aria-hidden="true">
                  <span className="os-font-mono" style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                    ↓
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
