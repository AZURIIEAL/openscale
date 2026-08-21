import { useEffect, useState } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import { RunButton } from '@/shared/design-system/RunButton';
import { Spinner } from '@/shared/design-system/Spinner';
import { StatusPill } from '@/shared/design-system/StatusPill';
import { JOB_CATALOG } from '../domain/entities';
import { useCancelAllRuns, useClearRuns, useJobRunsPage } from '../application/useJobRuns';
import { useTriggerJob } from '../application/useTriggerJob';
import { useRunAllJobs, PIPELINE_ORDER } from '../application/useRunAllJobs';
import { RunJobForm } from './RunJobForm';
import { JobRunsTable } from './JobRunsTable';
import { JobRunLogPanel } from './JobRunLogPanel';
import { ClearDataButton } from './ClearDataButton';

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
  const cancelAllRuns = useCancelAllRuns();
  const { mutate, mutateAsync, isPending } = useTriggerJob();
  const [openJobType, setOpenJobType] = useState<string | null>(null);
  const [runAllFormOpen, setRunAllFormOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const runAll = useRunAllJobs(mutateAsync, setSelectedRunId);
  const runAllActive = runAll.state.phase === 'running';
  const hasActiveRuns = runs?.some((run) => run.state === 'queued' || run.state === 'running') ?? false;

  // selectedRunId is component state, so a page refresh loses it -- if a
  // run is still queued/running when the run list loads, re-select it so
  // the log panel (and its WebSocket) comes back instead of vanishing.
  useEffect(() => {
    if (selectedRunId || !runs) return;
    const inFlight = runs.find((run) => run.state === 'queued' || run.state === 'running');
    if (inFlight) setSelectedRunId(inFlight.id);
  }, [runs, selectedRunId]);

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>Job Catalog</h3>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>Five jobs, run individually or as a chain</p>
          </div>
          <div className="flex items-center gap-3">
            {runAll.state.phase !== 'idle' && (
              <span
                className="os-font-mono flex items-center gap-2 text-[11px] uppercase tracking-[0.06em]"
                style={{ color: runAll.state.phase === 'stopped' ? 'var(--danger)' : 'var(--text-muted)' }}
              >
                {runAllActive && <Spinner />}
                {runAll.state.phase === 'running' &&
                  `Step ${runAll.state.stepIndex + 1} of ${PIPELINE_ORDER.length} — ${PIPELINE_ORDER[runAll.state.stepIndex]}`}
                {runAll.state.phase === 'stopped' &&
                  `Stopped at step ${runAll.state.stepIndex + 1} of ${PIPELINE_ORDER.length} (${runAll.state.jobType} ${runAll.state.finalState})`}
                {runAll.state.phase === 'done' && `All ${PIPELINE_ORDER.length} steps complete`}
              </span>
            )}
            {hasActiveRuns && (
              <button
                type="button"
                disabled={cancelAllRuns.isPending}
                className="text-[13px] font-semibold"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: cancelAllRuns.isPending ? 'default' : 'pointer',
                  padding: 0,
                  color: 'var(--danger)',
                }}
                onClick={() => cancelAllRuns.mutate()}
              >
                {cancelAllRuns.isPending ? 'Stopping…' : 'Stop all'}
              </button>
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
        </header>

        {runAllFormOpen && (
          <Well className="mt-4 p-3">
            <RunJobForm
              fields={INGEST_FIELDS}
              pending={runAllActive}
              submitLabel="Run all"
              onSubmit={(params) => {
                setRunAllFormOpen(false);
                runAll.runAll(params);
              }}
            />
          </Well>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {JOB_CATALOG.map((job) => {
            const runningRun = runs?.find(
              (run) => run.jobType === job.type && (run.state === 'queued' || run.state === 'running'),
            );
            const disabled = runAllActive || isPending;

            // During Run All, every row other than the one currently in
            // flight gets a static pill instead of the real per-run lookup
            // above -- steps later in PIPELINE_ORDER haven't been triggered
            // yet (so there's no run row for them to find), and steps earlier
            // in it already went terminal (so runningRun no longer matches).
            const stepIndex = runAllActive ? PIPELINE_ORDER.indexOf(job.type as (typeof PIPELINE_ORDER)[number]) : -1;
            const runAllStepStatus =
              stepIndex === -1 || runAll.state.phase !== 'running'
                ? null
                : stepIndex < runAll.state.stepIndex
                  ? 'completed'
                  : stepIndex > runAll.state.stepIndex
                    ? 'queued'
                    : null; // the in-flight step -- falls through to the runningRun spinner below

            return (
              <div key={job.type}>
                <Well className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{job.label}</span>
                      <span
                        className="os-font-mono"
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
                    </div>
                    <p className="text-wrap-pretty" style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                      {job.description}
                    </p>
                  </div>
                  <div className="flex-none">
                    {runAllStepStatus === 'completed' ? (
                      <StatusPill status="good">Completed</StatusPill>
                    ) : runAllStepStatus === 'queued' ? (
                      <StatusPill status="warn">Queued</StatusPill>
                    ) : runningRun ? (
                      <button
                        type="button"
                        className="os-font-mono flex flex-shrink-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em]"
                        style={{ color: 'var(--warning)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
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
                  </div>
                </Well>
                {job.paramFields && !runningRun && openJobType === job.type && (
                  <div className="px-5 pb-1 pt-3">
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
        </div>

        <div className="mt-4 flex items-center justify-end">
          <ClearDataButton onRunStarted={setSelectedRunId} />
        </div>
      </Panel>

      {selectedRunId && <JobRunLogPanel jobId={selectedRunId} />}

      {historyQuery.isError ? (
        <div className="text-sm" style={{ color: 'var(--danger)' }}>
          Failed to load run history. Is the control-plane running?
        </div>
      ) : historyQuery.isLoading || !historyQuery.data ? (
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
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
