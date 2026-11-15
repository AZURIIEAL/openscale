import type { Status } from '@/shared/types/status';
import type { JobDefinition, JobState, ParamSpec, ParamValues } from './entities';

/**
 * Frontend mirror of the Go control-plane's jobs.DisplayStatus -- maps a
 * run's 4-value state down to the shared good/warn/crit signal StatusPill
 * and Led already know how to render.
 */
export function deriveRunStatus(state: JobState): Status {
  switch (state) {
    case 'succeeded':
      return 'good';
    case 'failed':
      return 'crit';
    default: // queued | running | partial
      return 'warn';
  }
}

export function stateLabel(state: JobState): string {
  switch (state) {
    case 'succeeded':
      return 'success';
    case 'partial':
      return 'partial';
    case 'failed':
      return 'failed';
    case 'running':
      return 'running';
    case 'queued':
      return 'queued';
    case 'cancelled':
      return 'cancelled';
  }
}

/** Shared by JobRunsTable (Pipelines) and RecentRunsTable (Home). */
export function formatRunTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString() : '—';
}

export function formatRunRows(rowsProcessed?: number): string {
  return rowsProcessed === undefined ? '—' : rowsProcessed.toLocaleString();
}

/** e.g. "12s (running)" while in progress, "3m 4s" once finished. */
export function formatRunDuration(
  startedAt: string | undefined,
  finishedAt: string | undefined,
  state: JobState,
): string {
  if (!startedAt) return state === 'queued' ? '(queued)' : '—';
  const endMs = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((endMs - new Date(startedAt).getTime()) / 1000));
  const label = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return finishedAt ? label : `${label} (running)`;
}

/** The jobs the Pipelines run list shows, in catalog order (the API
 * already sorts by each job's declared order). */
export function listedJobs(catalog: JobDefinition[]): JobDefinition[] {
  return catalog.filter((job) => job.listed);
}

/** A form's starting values: each field's default, as the string the
 * input edits. */
export function initialParamValues(schema: ParamSpec[]): ParamValues {
  const values: ParamValues = {};
  for (const p of schema) {
    if (p.default !== undefined && p.default !== null) values[p.name] = String(p.default);
    else if (p.type === 'boolean') values[p.name] = 'false';
  }
  return values;
}

/** The typed body POST .../jobs/{type}/run validates: numbers as numbers,
 * booleans as booleans, empty optional fields left out. */
export function paramsFromValues(schema: ParamSpec[], values: ParamValues): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const p of schema) {
    const raw = (values[p.name] ?? '').trim();
    if (p.type === 'boolean') {
      if (raw !== '') params[p.name] = raw === 'true';
    } else if (raw === '') {
      continue;
    } else if (p.type === 'number' || p.type === 'integer') {
      params[p.name] = Number(raw);
    } else {
      params[p.name] = raw;
    }
  }
  return params;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** The first problem with each field, mirroring the control-plane's
 * jobs.ValidateParams so the form explains itself instead of surfacing a
 * 400. An empty object means the values can be submitted. */
export function paramErrors(schema: ParamSpec[], values: ParamValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const labels = new Map(schema.map((p) => [p.name, p.label]));

  for (const p of schema) {
    const raw = (values[p.name] ?? '').trim();
    if (raw === '') {
      if (p.required) errors[p.name] = 'Required';
      continue;
    }
    if (p.type === 'number' || p.type === 'integer') {
      const n = Number(raw);
      if (!Number.isFinite(n)) errors[p.name] = 'Must be a number';
      else if (p.type === 'integer' && !Number.isInteger(n)) errors[p.name] = 'Must be a whole number';
      else if (typeof p.min === 'number' && n < p.min) errors[p.name] = `Must be at least ${p.min}`;
      else if (typeof p.max === 'number' && n > p.max) errors[p.name] = `Must be at most ${p.max}`;
    } else if (p.type === 'date' || p.type === 'month') {
      const pattern = p.type === 'month' ? MONTH_PATTERN : DATE_PATTERN;
      if (!pattern.test(raw)) errors[p.name] = p.type === 'month' ? 'Use YYYY-MM' : 'Use YYYY-MM-DD';
      else if (typeof p.min === 'string' && raw < p.min) errors[p.name] = `Must be ${p.min} or later`;
      else if (typeof p.max === 'string' && raw > p.max) errors[p.name] = `Must be ${p.max} or earlier`;
    } else if (p.type === 'enum' && !(p.options ?? []).includes(raw)) {
      errors[p.name] = 'Pick one of the options';
    }
  }

  // Ordering pairs (an end on or after its start), once both sides are valid.
  for (const p of schema) {
    if (!p.gte || errors[p.name] || errors[p.gte]) continue;
    const a = (values[p.name] ?? '').trim();
    const b = (values[p.gte] ?? '').trim();
    if (a === '' || b === '') continue;
    const before = p.type === 'number' || p.type === 'integer' ? Number(a) < Number(b) : a < b;
    if (before) errors[p.name] = `Must be on or after ${labels.get(p.gte) ?? p.gte}`;
  }
  return errors;
}

