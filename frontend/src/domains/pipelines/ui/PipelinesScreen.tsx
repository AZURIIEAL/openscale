import { useEffect, useState } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import { RunButton } from '@/shared/design-system/RunButton';
import { Spinner } from '@/shared/design-system/Spinner';
import { JOB_CATALOG } from '../domain/entities';
import { useJobRuns } from '../application/useJobRuns';
import { useTriggerJob } from '../application/useTriggerJob';
import { RunJobForm } from './RunJobForm';
import { JobRunsTable } from './JobRunsTable';
import { JobRunLogPanel } from './JobRunLogPanel';

/**
 * Real (Phase 2: "control the existing pipeline") -- `ingest` triggers the
 * real job-queue end to end (control-plane -> Redis -> worker -> Postgres,
 * live status over WebSocket). Every other catalog entry is shown for
 * roadmap context but marked "coming soon" rather than faking a working
 * trigger -- generic bring-your-own-job registration is Phase 3, not this.
 */
export function PipelinesScreen() {
  const { data: runs, isLoading, isError } = useJobRuns();
  const { mutate, isPending } = useTriggerJob();
  const [openJobType, setOpenJobType] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // selectedRunId is component state, so a page refresh loses it -- if a
  // run is still queued/running when the run list loads, re-select it so
  // the log panel (and its WebSocket) comes back instead of vanishing.
  useEffect(() => {
    if (selectedRunId || !runs) return;
    const inFlight = runs.find((run) => run.state === 'queued' || run.state === 'running');
    if (inFlight) setSelectedRunId(inFlight.id);
  }, [runs, selectedRunId]);

  return (
    <div>
      <div className="os-font-mono mb-2.5 ml-0.5 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-muted)' }}>
        Job catalog
      </div>
      <Panel className="mb-4 flex flex-col gap-1.5 p-2">
        {JOB_CATALOG.map((job) => {
          const runningRun = runs?.find(
            (run) => run.jobType === job.type && (run.state === 'queued' || run.state === 'running'),
          );
          return (
            <div key={job.type}>
              <Well className="flex flex-wrap items-center gap-3.5 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">{job.label}</div>
                  <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                    {job.description}
                  </div>
                </div>
                {runningRun ? (
                  <button
                    type="button"
                    className="os-font-mono flex flex-shrink-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: 'var(--warn)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={() => setSelectedRunId(runningRun.id)}
                    title="Jump to this run's log"
                  >
                    <Spinner />
                    {runningRun.state === 'queued' ? 'Queued…' : 'Running…'}
                  </button>
                ) : job.paramFields ? (
                  <RunButton onClick={() => setOpenJobType(openJobType === job.type ? null : job.type)}>
                    {openJobType === job.type ? 'Cancel' : 'Configure run'}
                  </RunButton>
                ) : (
                  <span
                    className="os-font-mono flex-shrink-0 text-[10.5px] uppercase tracking-[0.06em]"
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    Coming soon
                  </span>
                )}
              </Well>
              {job.paramFields && !runningRun && openJobType === job.type && (
                <div className="px-4 pb-3 pt-2">
                  <RunJobForm
                    fields={job.paramFields}
                    pending={isPending}
                    onSubmit={(params) =>
                      mutate(
                        { jobType: job.type, params },
                        {
                          onSuccess: (run) => {
                            setSelectedRunId(run.id);
                            setOpenJobType(null);
                          },
                        },
                      )
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
      </Panel>

      {selectedRunId && (
        <div className="mb-4">
          <JobRunLogPanel jobId={selectedRunId} />
        </div>
      )}

      {isError ? (
        <div className="text-sm" style={{ color: 'var(--crit)' }}>
          Failed to load run history. Is the control-plane running?
        </div>
      ) : isLoading || !runs ? (
        <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Loading run history…
        </div>
      ) : (
        <JobRunsTable runs={runs} selectedRunId={selectedRunId} onSelect={setSelectedRunId} />
      )}
    </div>
  );
}
