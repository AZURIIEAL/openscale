import { useMemo, useState } from 'react';
import { RunButton } from '@/shared/design-system/RunButton';
import { Toggle } from '@/shared/design-system/Toggle';
import { useDatasets } from '@/domains/datasets/application/useDatasets';
import type { Dataset } from '@/domains/datasets/domain/entities';
import type { ParamSpec, ParamValues } from '../domain/entities';
import { initialParamValues, paramErrors, paramsFromValues, valuesFromParams } from '../domain/rules';

interface RunJobFormProps {
  /** The job's params schema from the catalog; the form renders one field per entry. */
  schema: ParamSpec[];
  pending: boolean;
  onSubmit: (params: Record<string, unknown>) => void;
  /** Reused by pipelines (run prompt, step editor), which need their own label. */
  submitLabel?: string;
  /** Params to start from instead of the schema's defaults. */
  initial?: Record<string, unknown>;
}

const inputClass = 'os-well os-font-mono rounded-lg px-2.5 py-2 text-[13px]';
const inputStyle = { background: 'transparent', border: 'none', color: 'var(--text-body)', outline: 'none' } as const;
const labelClass = 'os-font-mono text-[10.5px] uppercase tracking-[0.06em]';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const CURRENT_MONTH = now.getMonth() + 1;
/** How far back the year list goes when a month field declares no `min`. */
const DEFAULT_YEARS_BACK = 25;

/**
 * A month field is two plain <select>s (month, year) instead of a native
 * <input type="month">. The native control packs year-entry into a
 * fiddly, easy-to-miss segment inside the same box -- a separate,
 * always-visible Year dropdown removes that guesswork, and sidesteps
 * browsers (older Safari/Firefox) that don't support type="month" well.
 * It keeps a half-picked month/year locally and reports "YYYY-MM" only once
 * both are chosen.
 */
function MonthYearField({ spec, value, onChange }: { spec: ParamSpec; value: string; onChange: (v: string) => void }) {
  const [month, setMonth] = useState(value.slice(5, 7));
  const [year, setYear] = useState(value.slice(0, 4));

  const minYear = typeof spec.min === 'string' ? Number(spec.min.slice(0, 4)) : CURRENT_YEAR - DEFAULT_YEARS_BACK;
  const years = Array.from({ length: Math.max(1, CURRENT_YEAR - minYear + 1) }, (_, i) => CURRENT_YEAR - i);
  const maxMonth = year === String(CURRENT_YEAR) ? CURRENT_MONTH : 12;

  const update = (nextMonth: string, nextYear: string) => {
    setMonth(nextMonth);
    setYear(nextYear);
    onChange(nextMonth && nextYear ? `${nextYear}-${nextMonth}` : '');
  };

  return (
    <div className="flex gap-1.5">
      <select className={inputClass} style={inputStyle} value={month} onChange={(e) => update(e.target.value, year)}>
        <option value="" disabled>
          Month
        </option>
        {MONTH_NAMES.map((name, i) => {
          const v = String(i + 1).padStart(2, '0');
          return (
            <option key={v} value={v} disabled={Number(v) > maxMonth}>
              {name}
            </option>
          );
        })}
      </select>
      <select
        className={inputClass}
        style={inputStyle}
        value={year}
        onChange={(e) => {
          const nextYear = e.target.value;
          const nextMax = nextYear === String(CURRENT_YEAR) ? CURRENT_MONTH : 12;
          update(Number(month) > nextMax ? '' : month, nextYear);
        }}
      >
        <option value="" disabled>
          Year
        </option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The project's ready datasets, shared by dataset and column fields. */
interface DatasetChoices {
  ready: Dataset[];
  isLoading: boolean;
}

function DatasetField({ value, onChange, choices }: { value: string; onChange: (v: string) => void; choices: DatasetChoices }) {
  const { ready, isLoading } = choices;
  return (
    <select className={inputClass} style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{isLoading ? 'Loading…' : ready.length ? 'Choose a dataset' : 'No ready datasets'}</option>
      {ready.map((d) => (
        <option key={d.id} value={d.name}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

/** Columns of the dataset picked in the field this one is `of`. */
function columnsOf(spec: ParamSpec, values: ParamValues, choices: DatasetChoices): string[] {
  const picked = spec.of ? values[spec.of] : undefined;
  const dataset = choices.ready.find((d) => d.name === picked);
  return dataset ? dataset.columns.map((c) => c.name) : [];
}

function ColumnsField({ columns, value, onChange }: { columns: string[]; value: string[]; onChange: (v: string[]) => void }) {
  if (columns.length === 0) {
    return (
      <span className="os-font-mono text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Choose a dataset first
      </span>
    );
  }
  return (
    <div className="os-well flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg px-2.5 py-2" style={{ minWidth: '12rem' }}>
      {columns.map((c) => (
        <label key={c} className="os-font-mono flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--text-body)' }}>
          <input
            type="checkbox"
            checked={value.includes(c)}
            onChange={(e) => onChange(e.target.checked ? [...value, c] : value.filter((v) => v !== c))}
          />
          {c}
        </label>
      ))}
    </div>
  );
}

interface ParamInputProps {
  spec: ParamSpec;
  value: string | string[];
  values: ParamValues;
  choices: DatasetChoices;
  onChange: (v: string | string[]) => void;
}

function ParamInput({ spec, value: rawValue, values, choices, onChange }: ParamInputProps) {
  const value = typeof rawValue === 'string' ? rawValue : '';
  switch (spec.type) {
    case 'month':
      return <MonthYearField spec={spec} value={value} onChange={onChange} />;
    case 'dataset':
      return <DatasetField value={value} onChange={onChange} choices={choices} />;
    case 'columns':
      return <ColumnsField columns={columnsOf(spec, values, choices)} value={Array.isArray(rawValue) ? rawValue : []} onChange={onChange} />;
    case 'column': {
      const columns = columnsOf(spec, values, choices);
      return (
        <select className={inputClass} style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{columns.length ? 'Choose a column' : 'Choose a dataset first'}</option>
          {columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      );
    }
    case 'text':
      return (
        <textarea
          className={inputClass}
          style={{ ...inputStyle, width: 'min(44rem, 80vw)', minHeight: '7rem', resize: 'vertical' }}
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'dataset_name':
      return (
        <input
          className={inputClass}
          style={inputStyle}
          placeholder="new_dataset"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'boolean':
      return <Toggle checked={value === 'true'} onChange={(checked) => onChange(String(checked))} label={spec.label} />;
    case 'enum':
      return (
        <select className={inputClass} style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
          {!spec.required && <option value="">—</option>}
          {spec.required && value === '' && (
            <option value="" disabled>
              Choose…
            </option>
          )}
          {(spec.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case 'date':
      return (
        <input
          className={inputClass}
          style={inputStyle}
          type="date"
          value={value}
          min={typeof spec.min === 'string' ? spec.min : undefined}
          max={typeof spec.max === 'string' ? spec.max : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
    case 'integer':
      return (
        <input
          className={inputClass}
          style={{ ...inputStyle, width: '9rem' }}
          type="number"
          inputMode={spec.type === 'integer' ? 'numeric' : 'decimal'}
          step={spec.type === 'integer' ? 1 : 'any'}
          value={value}
          min={typeof spec.min === 'number' ? spec.min : undefined}
          max={typeof spec.max === 'number' ? spec.max : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return <input className={inputClass} style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
}

/**
 * A run form generated from the job's params schema in the catalog -- the
 * worker's @job declaration is the only place a job's parameters are
 * defined. Each field validates the same way the control-plane will
 * (domain/rules.ts's paramErrors), so the button stays disabled until the
 * run would be accepted.
 */
export function RunJobForm({ schema, pending, onSubmit, submitLabel = 'Start run', initial }: RunJobFormProps) {
  const [values, setValues] = useState<ParamValues>(() => (initial ? valuesFromParams(schema, initial) : initialParamValues(schema)));
  const errors = useMemo(() => paramErrors(schema, values), [schema, values]);
  const usesDatasets = schema.some((p) => p.type === 'dataset');
  const datasetsQuery = useDatasets();
  const choices: DatasetChoices = {
    ready: usesDatasets ? (datasetsQuery.data ?? []).filter((d) => d.status === 'ready') : [],
    isLoading: datasetsQuery.isLoading,
  };
  const canSubmit = Object.keys(errors).length === 0 && !pending;

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(paramsFromValues(schema, values));
      }}
    >
      {schema.map((spec) => {
        // "Required" is what the disabled button already says; only show
        // errors about something the user actually entered.
        const Wrapper = spec.type === 'columns' ? 'div' : 'label';
        const entered = values[spec.name];
        const error = errors[spec.name] && typeof entered === 'string' && entered !== '' ? errors[spec.name] : null;
        const field = (
          <ParamInput
            spec={spec}
            value={values[spec.name] ?? ''}
            values={values}
            choices={choices}
            onChange={(v) =>
              setValues((prev) => {
                const next = { ...prev, [spec.name]: v };
                // A new dataset invalidates the columns picked from the old one.
                for (const other of schema) {
                  if (other.of === spec.name) next[other.name] = other.type === 'columns' ? [] : '';
                }
                return next;
              })
            }
          />
        );
        return (
          // A columns field holds its own checkbox labels, and labels can't nest.
          <Wrapper key={spec.name} className="flex flex-col gap-1" title={spec.description}>
            {spec.type !== 'boolean' && (
              <span className={labelClass} style={{ color: 'var(--text-subtle)' }}>
                {spec.label}
                {spec.required ? '' : ' (optional)'}
              </span>
            )}
            {field}
            {error && (
              <span className="os-font-mono text-[11px]" style={{ color: 'var(--danger)' }}>
                {error}
              </span>
            )}
          </Wrapper>
        );
      })}
      <RunButton type="submit" disabled={!canSubmit}>
        {pending ? 'Starting…' : submitLabel}
      </RunButton>
    </form>
  );
}
