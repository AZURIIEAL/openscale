import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import { RunButton } from '@/shared/design-system/RunButton';
import { Spinner } from '@/shared/design-system/Spinner';
import { FEATURE_LEGACY_TAXI, hasFeature, useCurrentProject } from '@/shared/project';
import { listedJobs } from '../domain/rules';
import { useCancelAllRuns, useClearRuns, useJobRunsPage } from '../application/useJobRuns';
import { useJobCatalog } from '../application/useJobCatalog';
import { useTriggerJob } from '../application/useTriggerJob';
import { RunJobForm } from './RunJobForm';
import { PipelinesPanel } from './PipelinesPanel';
import { JobRunsTable } from './JobRunsTable';
import { JobRunLogPanel } from './JobRunLogPanel';
import { ClearDataButton } from './ClearDataButton';

/**
 * Every listed job in the catalog the worker publishes triggers the real
 * job queue end to end (control-plane -> Redis -> worker -> Postgres, live
 * status over WebSocket). A job with a params schema opens its generated
 * RunJobForm first; one without runs immediately on click.
 */
/** Search results (see shared/search) can land here with a specific job's
 * form already open or a specific run already selected -- react-router
 * navigation state, read once on mount. */
interface PipelinesNavState {
  openJobType?: string;
  selectedRunId?: string;
}

export function PipelinesScreen() {
  const navState = useLocation().state as PipelinesNavState | null;
  const { project } = useCurrentProject();
  const catalogQuery = useJobCatalog();
  const jobs = listedJobs(catalogQuery.data ?? [], (feature) => hasFeature(project, feature));
  // Clear data wipes the taxi lake; Phase 4e removes it with the taxi code.
  const taxi = hasFeature(project, FEATURE_LEGACY_TAXI);
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
  const { mutate, isPending } = useTriggerJob();
  const [openJobType, setOpenJobType] = useState<string | null>(navState?.openJobType ?? null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(navState?.selectedRunId ?? null);

  const selectRun = useCallback((id: string) => setSelectedRunId(id), []);
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
      <PipelinesPanel jobs={jobs} onSelectRun={selectRun} />

      <Panel>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>Job Catalog</h3>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
              {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}, each run on its own
            </p>
          </div>
          <div className="flex items-center gap-3">
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
          </div>
        </header>

        <div className="mt-4 flex flex-col gap-3">
          {catalogQuery.isError && (
            <div className="text-sm" style={{ color: 'var(--danger)' }}>
              Failed to load the job catalog. Is the control-plane running?
            </div>
          )}
          {catalogQuery.isLoading && (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Loading jobs…
            </div>
          )}
          {catalogQuery.isSuccess && jobs.length === 0 && (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No jobs published yet. The worker publishes its job catalog when it starts.
            </div>
          )}
          {jobs.map((job) => {
            const runningRun = runs?.find(
              (run) => run.jobType === job.type && (run.state === 'queued' || run.state === 'running'),
            );
            const disabled = isPending;

            return (
              <div key={job.type}>
                <Well className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{job.label}</span>
                      {job.stage && (
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
                      )}
                    </div>
                    <p className="text-wrap-pretty" style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                      {job.description}
                    </p>
                  </div>
                  <div className="flex-none">
                    {runningRun ? (
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
                    ) : job.paramsSchema.length > 0 ? (
                      <RunButton
                        disabled={disabled}
                        onClick={() => setOpenJobType(openJobType === job.type ? null : job.type)}
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
                {job.paramsSchema.length > 0 && !runningRun && openJobType === job.type && (
                  <div className="px-5 pb-1 pt-3">
                    <RunJobForm
                      schema={job.paramsSchema}
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

        {taxi && (
          <div className="mt-4 flex items-center justify-end">
            <ClearDataButton onRunStarted={setSelectedRunId} />
          </div>
        )}
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
