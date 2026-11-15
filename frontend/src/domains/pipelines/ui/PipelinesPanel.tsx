import { useEffect, useState } from 'react';
import { Badge } from '@/shared/design-system/Badge';
import { Panel } from '@/shared/design-system/Panel';
import { RunButton } from '@/shared/design-system/RunButton';
import { Spinner } from '@/shared/design-system/Spinner';
import { StatusPill } from '@/shared/design-system/StatusPill';
import { Well } from '@/shared/design-system/Well';
import { ActionButton } from '@/domains/datasets/ui/ActionButton';
import { useCancelPipelineRun, useDeletePipeline, usePipelineRuns, usePipelines, useRunPipeline } from '../application/usePipelines';
import type { JobDefinition, Pipeline, PipelineRun } from '../domain/entities';
import { deriveRunStatus, formatRunTime, pipelineStepState, stateLabel } from '../domain/rules';
import { PipelineEditor } from './PipelineEditor';
import { RunJobForm } from './RunJobForm';

type Tone = Parameters<typeof Badge>[0]['tone'];
const STEP_TONE: Record<ReturnType<typeof pipelineStepState>, Tone> = {
  succeeded: 'success',
  partial: 'warning',
  running: 'info',
  queued: 'info',
  failed: 'danger',
  cancelled: 'neutral',
  pending: 'neutral',
  skipped: 'neutral',
};

interface PipelinesPanelProps {
  /** The job types this project may run (the editor's step choices). */
  jobs: JobDefinition[];
  /** Opens a job run's live log below. */
  onSelectRun: (runId: string) => void;
}

/**
 * The project's saved pipelines. Run hands the pipeline to the
 * control-plane, whose orchestrator queues each step after the previous one
 * succeeds; this panel only shows how far it got. While a run goes on, the
 * log panel follows its current step.
 */
export function PipelinesPanel({ jobs, onSelectRun }: PipelinesPanelProps) {
  const pipelines = usePipelines();
  const runs = usePipelineRuns();
  const [editing, setEditing] = useState<Pipeline | 'new' | null>(null);

  const following = runs.data?.find((r) => r.status === 'running')?.jobs.at(-1)?.runId;
  useEffect(() => {
    if (following) onSelectRun(following);
  }, [following, onSelectRun]);

  const list = pipelines.data ?? [];
  return (
    <Panel>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>Pipelines</h3>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
            Jobs chained in order: each step starts when the one before it succeeds.
          </p>
        </div>
        {editing === null && <ActionButton onClick={() => setEditing('new')}>+ New pipeline</ActionButton>}
      </header>

      <div className="mt-4 flex flex-col gap-3">
        {editing === 'new' && <PipelineEditor jobs={jobs} onDone={() => setEditing(null)} />}
        {pipelines.isError && (
          <div className="text-sm" style={{ color: 'var(--danger)' }}>
            Failed to load pipelines. Is the control-plane running?
          </div>
        )}
        {pipelines.isSuccess && list.length === 0 && editing !== 'new' && (
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No pipelines yet. Chain jobs into one to run them in order with one click.
          </div>
        )}
        {list.map((p) =>
          editing !== 'new' && editing?.name === p.name ? (
            <PipelineEditor key={p.id} pipeline={p} jobs={jobs} onDone={() => setEditing(null)} />
          ) : (
            <PipelineCard
              key={p.id}
              pipeline={p}
              jobs={jobs}
              latest={runs.data?.find((r) => r.pipelineName === p.name)}
              onEdit={() => setEditing(p)}
              onSelectRun={onSelectRun}
            />
          ),
        )}
      </div>
    </Panel>
  );
}

interface PipelineCardProps {
  pipeline: Pipeline;
  jobs: JobDefinition[];
  latest?: PipelineRun;
  onEdit: () => void;
  onSelectRun: (runId: string) => void;
}

function PipelineCard({ pipeline, jobs, latest, onEdit, onSelectRun }: PipelineCardProps) {
  const run = useRunPipeline();
  const cancel = useCancelPipelineRun();
  const remove = useDeletePipeline();
  const [prompt, setPrompt] = useState(false);
  const label = (type: string) => jobs.find((j) => j.type === type)?.label ?? type;
  // The first step's params can be changed per run (the taxi month range).
  const firstSchema = jobs.find((j) => j.type === pipeline.steps[0]?.jobType)?.paramsSchema ?? [];
  const running = latest?.status === 'running';
  // Show the latest run's step states only while it matches the saved steps.
  const shown = latest && latest.steps.length === pipeline.steps.length ? latest : undefined;
  const error = run.error ?? cancel.error ?? remove.error;

  const start = (params?: Record<string, unknown>) => run.mutate({ name: pipeline.name, params }, { onSuccess: () => setPrompt(false) });

  return (
    <div>
      <Well className="flex flex-col gap-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{pipeline.name}</span>
            {pipeline.description && (
              <p className="text-wrap-pretty" style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                {pipeline.description}
              </p>
            )}
          </div>
          {running ? (
            <>
              <span className="os-font-mono flex items-center gap-2 text-[11px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
                <Spinner /> Step {latest.currentStep + 1} of {latest.steps.length}
              </span>
              <ActionButton danger disabled={cancel.isPending} onClick={() => cancel.mutate(latest.id)}>
                {cancel.isPending ? 'Stopping…' : 'Stop'}
              </ActionButton>
            </>
          ) : (
            <>
              {latest && (
                <span title={latest.error} className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  <StatusPill status={deriveRunStatus(latest.status)}>{stateLabel(latest.status)}</StatusPill>
                  {formatRunTime(latest.finishedAt ?? latest.submittedAt)}
                </span>
              )}
              <ActionButton onClick={onEdit}>Edit</ActionButton>
              <ActionButton
                danger
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Delete pipeline "${pipeline.name}"? Its past runs stay in the history.`)) remove.mutate(pipeline.name);
                }}
              >
                Delete
              </ActionButton>
              <RunButton disabled={run.isPending} onClick={() => (firstSchema.length > 0 ? setPrompt((open) => !open) : start())}>
                {prompt ? 'Cancel' : 'Run'}
              </RunButton>
            </>
          )}
        </div>

        <ol className="m-0 flex flex-wrap items-center gap-1.5 p-0" style={{ listStyle: 'none' }} aria-label="Steps">
          {pipeline.steps.map((step, i) => {
            const state = shown ? pipelineStepState(shown, i) : 'pending';
            const job = shown?.jobs.find((j) => j.stepIndex === i);
            const chip = (
              <Badge tone={shown ? STEP_TONE[state] : 'neutral'} dot={state === 'running' || state === 'queued'}>
                {i + 1}. {label(step.jobType)}
                {shown && state !== 'pending' && state !== 'succeeded' ? ` · ${state}` : ''}
              </Badge>
            );
            return (
              <li key={i} className="flex items-center gap-1.5">
                {i > 0 && <span style={{ color: 'var(--text-subtle)' }}>→</span>}
                {job ? (
                  <button
                    type="button"
                    onClick={() => onSelectRun(job.runId)}
                    title="Show this step's log"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    {chip}
                  </button>
                ) : (
                  chip
                )}
              </li>
            );
          })}
        </ol>
        {shown?.error && shown.status !== 'running' && (
          <p className="m-0 text-[12px]" style={{ color: shown.status === 'cancelled' ? 'var(--text-muted)' : 'var(--danger)' }}>
            {shown.error}
          </p>
        )}
        {error && (
          <p className="m-0 whitespace-pre-wrap text-[12px]" style={{ color: 'var(--danger)' }}>
            {error.message.replace(/^\w+ \S+ failed: \d+ /, '')}
          </p>
        )}
      </Well>
      {prompt && !running && (
        <div className="px-5 pb-1 pt-3">
          <RunJobForm schema={firstSchema} initial={pipeline.steps[0].params} pending={run.isPending} submitLabel="Run pipeline" onSubmit={start} />
        </div>
      )}
    </div>
  );
}
