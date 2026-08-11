import { useEffect, useState } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import { RunButton } from '@/shared/design-system/RunButton';
import { Spinner } from '@/shared/design-system/Spinner';
import { JOB_CATALOG } from '../domain/entities';
import { useClearRuns, useJobRunsPage } from '../application/useJobRuns';
import { useTriggerJob } from '../application/useTriggerJob';
import { useRunAllJobs, PIPELINE_ORDER } from '../application/useRunAllJobs';
import { RunJobForm } from './RunJobForm';
import { JobRunsTable } from './JobRunsTable';
import { JobRunLogPanel } from './JobRunLogPanel';

const INGEST_FIELDS = JOB_CATALOG.find((job) => job.type === 'ingest')?.paramFields ?? [];

/**
 * Real (Phase 2: "control the existing pipeline") -- every catalog entry
 * triggers the real job-queue end to end (control-plane -> Redis -> worker
 * -> Postgres, live status over WebSocket). `ingest` needs a date range
 * first (RunJobForm); the rest process whatever's currently available
 * upstream and run immediately on click, no configuration step.
 */
export function PipelinesScreen() {
  const [historyPage, setHistoryPage] = useState(0);
  // Always-page-0 query for "is any job currently running" (catalog
  // spinners, reselect-on-refresh) -- independent of whichever history page
  // the user has paged to. When historyPage is 0 this is the same
  // queryKey as historyQuery below, so React Query serves both from one
  // network request.
  const { data: recentPage } = useJobRunsPage(0);
  const runs = recentPage?.runs;
  const historyQuery = useJobRunsPage(historyPage);
  const clearRuns = useClearRuns();
  const { mutate, mutateAsync, isPending } = useTriggerJob();
  const [openJobType, setOpenJobType] = useState<string | null>(null);
  const [runAllFormOpen, setRunAllFormOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const runAll = useRunAllJobs(mutateAsync, setSelectedRunId);
  const runAllActive = runAll.state.phase === 'running';

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
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="os-font-mono ml-0.5 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-muted)' }}>
          Job catalog
        </div>
        <div className="flex items-center gap-3">
          {runAll.state.phase !== 'idle' && (
            <span className="os-font-mono flex items-center gap-2 text-[11px] uppercase tracking-[0.06em]" style={{ color: runAll.state.phase === 'stopped' ? 'var(--crit)' : 'var(--ink-muted)' }}>
              {runAllActive && <Spinner />}
              {runAll.state.phase === 'running' &&
                `Step ${runAll.state.stepIndex + 1} of ${PIPELINE_ORDER.length} — ${PIPELINE_ORDER[runAll.state.stepIndex]}`}
              {runAll.state.phase === 'stopped' &&
                `Stopped at step ${runAll.state.stepIndex + 1} of ${PIPELINE_ORDER.length} (${runAll.state.jobType} failed)`}
              {runAll.state.phase === 'done' && `All ${PIPELINE_ORDER.length} steps complete`}
            </span>
          )}
          <RunButton
            disabled={runAllActive || isPending}
            onClick={() => {
              setOpenJobType(null);
              setRunAllFormOpen((open) => !open);
            }}
          >
            {runAllFormOpen ? 'Cancel' : 'Run all'}
          </RunButton>
        </div>
      </div>

      {runAllFormOpen && (
        <Panel className="mb-2.5 p-3">
          <RunJobForm
            fields={INGEST_FIELDS}
            pending={runAllActive}
            submitLabel="Run all"
            onSubmit={(params) => {
              setRunAllFormOpen(false);
              runAll.runAll(params);
            }}
          />
        </Panel>
      )}

      <Panel className="mb-4 flex flex-col gap-1.5 p-2">
        {JOB_CATALOG.map((job) => {
          const runningRun = runs?.find(
            (run) => run.jobType === job.type && (run.state === 'queued' || run.state === 'running'),
          );
          const disabled = runAllActive || isPending;
          return (
            <div key={job.type}>
              <Well className="flex flex-wrap items-center gap-3.5 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">{job.label}</div>
                  <div className="mt-1 text-[12.5px] leading-snug" style={{ color: 'var(--ink-muted)' }}>
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
                  <RunButton
                    disabled={disabled}
                    onClick={() => {
                      setRunAllFormOpen(false);
                      setOpenJobType(openJobType === job.type ? null : job.type);
                    }}
                  >
                    {openJobType === job.type ? 'Cancel' : 'Run'}
                  </RunButton>
                ) : (
                  <RunButton
                    disabled={disabled}
                    onClick={() =>
                      mutate({ jobType: job.type, params: {} }, { onSuccess: (run) => setSelectedRunId(run.id) })
                    }
                  >
                    Run
                  </RunButton>
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

      {historyQuery.isError ? (
        <div className="text-sm" style={{ color: 'var(--crit)' }}>
          Failed to load run history. Is the control-plane running?
        </div>
      ) : historyQuery.isLoading || !historyQuery.data ? (
        <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Loading run history…
        </div>
      ) : (
        <JobRunsTable
          runs={historyQuery.data.runs}
          selectedRunId={selectedRunId}
          onSelect={setSelectedRunId}
          page={historyPage}
          hasMore={historyQuery.data.hasMore}
          onPageChange={setHistoryPage}
          onClear={() => clearRuns.mutate(undefined, { onSuccess: () => setHistoryPage(0) })}
          clearing={clearRuns.isPending}
        />
      )}
    </div>
  );
}
