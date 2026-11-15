import { useState } from 'react';
import { Well } from '@/shared/design-system/Well';
import { ActionButton } from '@/domains/datasets/ui/ActionButton';
import { useSavePipeline } from '../application/usePipelines';
import type { JobDefinition, Pipeline, PipelineStep } from '../domain/entities';
import { describeParams, initialParamValues, paramsFromValues } from '../domain/rules';
import { RunJobForm } from './RunJobForm';

const inputClass = 'os-well rounded-lg px-2.5 py-1.5 text-[12.5px]';
const inputStyle = { background: 'transparent', border: 'none', color: 'var(--text-body)', outline: 'none' } as const;

interface PipelineEditorProps {
  /** Absent for a new pipeline. */
  pipeline?: Pipeline;
  jobs: JobDefinition[];
  onDone: () => void;
}

/**
 * A pipeline's steps as an editable list. Each step's params are set with
 * the job's own run form; the control-plane checks every step against the
 * job catalog on save and names the first bad one.
 */
export function PipelineEditor({ pipeline, jobs, onDone }: PipelineEditorProps) {
  const [name, setName] = useState(pipeline?.name ?? '');
  const [description, setDescription] = useState(pipeline?.description ?? '');
  const [steps, setSteps] = useState<PipelineStep[]>(pipeline?.steps ?? []);
  const [openStep, setOpenStep] = useState<number | null>(null);
  const save = useSavePipeline();

  const schemaOf = (type: string) => jobs.find((j) => j.type === type)?.paramsSchema ?? [];
  const defaults = (type: string) => paramsFromValues(schemaOf(type), initialParamValues(schemaOf(type)));
  const setStep = (i: number, step: PipelineStep) => setSteps((all) => all.map((s, j) => (j === i ? step : s)));
  const move = (i: number, by: -1 | 1) => {
    setOpenStep(null);
    setSteps((all) => {
      const next = [...all];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  };

  function onSave() {
    save.mutate({ input: { name: name.trim(), description, steps }, isNew: !pipeline }, { onSuccess: onDone });
  }

  return (
    <Well className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} os-font-mono`}
          style={{ ...inputStyle, width: '14rem' }}
          aria-label="Pipeline name"
          placeholder="pipeline_name"
          autoCapitalize="off"
          spellCheck={false}
          disabled={!!pipeline}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={inputClass}
          style={{ ...inputStyle, flex: 1, minWidth: '14rem' }}
          aria-label="Description"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {steps.map((step, i) => {
        const schema = schemaOf(step.jobType);
        return (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="os-font-mono os-tabular-nums w-5 text-right text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                {i + 1}
              </span>
              <select
                className={inputClass}
                style={inputStyle}
                aria-label={`Step ${i + 1} job`}
                value={step.jobType}
                onChange={(e) => {
                  setOpenStep(null);
                  setStep(i, { jobType: e.target.value, params: defaults(e.target.value) });
                }}
              >
                {!jobs.some((j) => j.type === step.jobType) && <option value={step.jobType}>{step.jobType}</option>}
                {jobs.map((j) => (
                  <option key={j.type} value={j.type}>
                    {j.label}
                  </option>
                ))}
              </select>
              <span className="os-font-mono min-w-0 flex-1 truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }} title={describeParams(step.params)}>
                {describeParams(step.params)}
              </span>
              {schema.length > 0 && (
                <ActionButton onClick={() => setOpenStep(openStep === i ? null : i)}>{openStep === i ? 'Close' : 'Params'}</ActionButton>
              )}
              <ActionButton onClick={() => move(i, -1)} disabled={i === 0} title="Move up" label="Move step up">
                ↑
              </ActionButton>
              <ActionButton onClick={() => move(i, 1)} disabled={i === steps.length - 1} title="Move down" label="Move step down">
                ↓
              </ActionButton>
              <ActionButton
                danger
                title="Remove step"
                label="Remove step"
                onClick={() => {
                  setOpenStep(null);
                  setSteps((all) => all.filter((_, j) => j !== i));
                }}
              >
                ✕
              </ActionButton>
            </div>
            {openStep === i && (
              <div className="pl-7">
                <RunJobForm
                  key={step.jobType}
                  schema={schema}
                  initial={step.params}
                  pending={false}
                  submitLabel="Use these params"
                  onSubmit={(params) => {
                    setStep(i, { ...step, params });
                    setOpenStep(null);
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          disabled={jobs.length === 0}
          onClick={() => setSteps((all) => [...all, { jobType: jobs[0].type, params: defaults(jobs[0].type) }])}
        >
          + Add step
        </ActionButton>
        <span className="flex-1" />
        <ActionButton onClick={onDone}>Cancel</ActionButton>
        <ActionButton onClick={onSave} disabled={save.isPending || !name.trim() || steps.length === 0}>
          {save.isPending ? 'Saving…' : pipeline ? 'Save pipeline' : 'Create pipeline'}
        </ActionButton>
      </div>
      {save.isError && (
        <p className="m-0 whitespace-pre-wrap text-[12px]" style={{ color: 'var(--danger)' }}>
          {save.error.message.replace(/^\w+ \S+ failed: \d+ /, '').replace(/^invalid pipeline: /, '')}
        </p>
      )}
    </Well>
  );
}
