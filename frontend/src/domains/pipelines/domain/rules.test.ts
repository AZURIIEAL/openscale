import { describe, expect, it } from 'vitest';
import {
  deriveRunStatus,
  formatRunDuration,
  formatRunRows,
  initialParamValues,
  listedJobs,
  paramErrors,
  paramsFromValues,
  stateLabel,
} from './rules';
import type { JobDefinition, JobState, ParamSpec } from './entities';

const ALL_STATES: JobState[] = ['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled'];

describe('deriveRunStatus', () => {
  it('mirrors the Go DisplayStatus mapping', () => {
    expect(deriveRunStatus('succeeded')).toBe('good');
    expect(deriveRunStatus('failed')).toBe('crit');
    for (const s of ['queued', 'running', 'partial', 'cancelled'] as JobState[]) {
      expect(deriveRunStatus(s)).toBe('warn');
    }
  });
});

describe('stateLabel', () => {
  it('has a label for every state', () => {
    for (const s of ALL_STATES) expect(stateLabel(s).length > 0).toBe(true);
    expect(stateLabel('succeeded')).toBe('success');
  });
});

describe('formatRunRows', () => {
  it('renders a dash when unreported and a grouped number otherwise', () => {
    expect(formatRunRows(undefined)).toBe('—');
    expect(formatRunRows(0)).toBe('0');
    expect(formatRunRows(1234567)).toBe((1234567).toLocaleString());
  });
});

describe('formatRunDuration', () => {
  it('shows queued or a dash before start', () => {
    expect(formatRunDuration(undefined, undefined, 'queued')).toBe('(queued)');
    expect(formatRunDuration(undefined, undefined, 'failed')).toBe('—');
  });
  it('formats seconds and minutes once finished', () => {
    expect(formatRunDuration('2026-01-01T00:00:00Z', '2026-01-01T00:00:12Z', 'succeeded')).toBe('12s');
    expect(formatRunDuration('2026-01-01T00:00:00Z', '2026-01-01T00:03:04Z', 'succeeded')).toBe('3m 4s');
  });
  it('marks an unfinished run as running', () => {
    const started = new Date(Date.now() - 5_000).toISOString();
    expect(formatRunDuration(started, undefined, 'running').endsWith('(running)')).toBe(true);
  });
  it('never goes negative when clocks disagree', () => {
    expect(formatRunDuration('2026-01-01T00:00:10Z', '2026-01-01T00:00:00Z', 'succeeded')).toBe('0s');
  });
});

// What the worker publishes for ingest and replay (worker/jobs/).
const INGEST: ParamSpec[] = [
  { name: 'start', type: 'month', label: 'Start', required: true, min: '2009-01' },
  { name: 'end', type: 'month', label: 'End', required: true, min: '2009-01', gte: 'start' },
];
const REPLAY: ParamSpec[] = [
  { name: 'limit', type: 'integer', label: 'Trips to send', default: 500, min: 1, max: 5000 },
  { name: 'messagesPerSecond', type: 'number', label: 'Messages per second', default: 10, min: 0.1, max: 100 },
  { name: 'date', type: 'date', label: 'Pickup date' },
];

describe('listedJobs', () => {
  const catalog = [
    { type: 'ingest', listed: true, requiresFeature: 'legacy_taxi' },
    { type: 'reset', listed: false, requiresFeature: 'legacy_taxi' },
    { type: 'validate', listed: true },
    { type: 'dataset_ingest', listed: false },
  ] as JobDefinition[];

  it('keeps catalog order and drops unlisted jobs', () => {
    expect(listedJobs(catalog, () => true).map((j) => j.type)).toEqual(['ingest', 'validate']);
  });

  it("hides jobs whose feature the project doesn't have", () => {
    expect(listedJobs(catalog, () => false).map((j) => j.type)).toEqual(['validate']);
    expect(listedJobs(catalog, (f) => f === 'legacy_taxi').map((j) => j.type)).toEqual(['ingest', 'validate']);
  });
});

// What the worker publishes for train and sql_transform.
const TRAIN: ParamSpec[] = [
  { name: 'dataset', type: 'dataset', label: 'Dataset', required: true },
  { name: 'target', type: 'column', label: 'Target column', required: true, of: 'dataset' },
  { name: 'features', type: 'columns', label: 'Feature columns', of: 'dataset' },
];
const TRANSFORM: ParamSpec[] = [
  { name: 'output', type: 'dataset_name', label: 'Output dataset', required: true },
  { name: 'sql', type: 'text', label: 'SQL', required: true },
];

describe('column and text params', () => {
  it('start columns fields empty and send picks as a list', () => {
    expect(initialParamValues(TRAIN)).toEqual({ features: [] });
    expect(paramsFromValues(TRAIN, { dataset: 'trips', target: 'fare', features: ['distance', 'zone'] })).toEqual({
      dataset: 'trips',
      target: 'fare',
      features: ['distance', 'zone'],
    });
    // an empty pick means "let the job choose", so it is left out
    expect(paramsFromValues(TRAIN, { dataset: 'trips', target: 'fare', features: [] })).toEqual({ dataset: 'trips', target: 'fare' });
  });

  it('requires a target but not features', () => {
    expect(paramErrors(TRAIN, { dataset: 'trips', target: '', features: [] })).toEqual({ target: 'Required' });
    expect(paramErrors(TRAIN, { dataset: 'trips', target: 'fare', features: [] })).toEqual({});
  });

  it('keeps SQL as typed and checks output names', () => {
    const sql = 'SELECT zone,\n  count(*)\nFROM trips GROUP BY 1';
    expect(paramsFromValues(TRANSFORM, { output: 'zone_totals', sql })).toEqual({ output: 'zone_totals', sql });
    expect(paramErrors(TRANSFORM, { output: 'Zone Totals', sql })).toEqual({
      output: 'Lowercase letters, digits and _; start with a letter',
    });
    expect(paramErrors(TRANSFORM, { output: 'zone_totals', sql: '   ' })).toEqual({ sql: 'Required' });
  });
});

describe('initialParamValues', () => {
  it('starts from defaults, as strings', () => {
    expect(initialParamValues(REPLAY)).toEqual({ limit: '500', messagesPerSecond: '10' });
    expect(initialParamValues(INGEST)).toEqual({});
    expect(initialParamValues([{ name: 'dry', type: 'boolean', label: 'Dry run' }])).toEqual({ dry: 'false' });
  });
});

describe('paramsFromValues', () => {
  it('sends typed values and leaves out empty optional fields', () => {
    expect(paramsFromValues(REPLAY, { limit: '200', messagesPerSecond: '2.5', date: '' })).toEqual({
      limit: 200,
      messagesPerSecond: 2.5,
    });
    expect(paramsFromValues(INGEST, { start: '2024-07', end: '2024-12' })).toEqual({ start: '2024-07', end: '2024-12' });
    expect(paramsFromValues([{ name: 'dry', type: 'boolean', label: 'Dry run' }], { dry: 'true' })).toEqual({ dry: true });
  });
});

describe('paramErrors', () => {
  it('accepts a valid ingest range, including a single month', () => {
    expect(paramErrors(INGEST, { start: '2024-07', end: '2024-12' })).toEqual({});
    expect(paramErrors(INGEST, { start: '2024-07', end: '2024-07' })).toEqual({});
  });

  it('flags required fields and an end before its start', () => {
    expect(paramErrors(INGEST, { start: '2024-07' })).toEqual({ end: 'Required' });
    expect(paramErrors(INGEST, { start: '2024-09', end: '2024-07' })).toEqual({ end: 'Must be on or after Start' });
  });

  it('applies month bounds and format', () => {
    expect(paramErrors(INGEST, { start: '2008-12', end: '2009-01' })).toEqual({ start: 'Must be 2009-01 or later' });
    expect(paramErrors(INGEST, { start: '2024-13', end: '2024-12' }).start).toBe('Use YYYY-MM');
  });

  it('checks numbers the way the control-plane does', () => {
    expect(paramErrors(REPLAY, { limit: '500', messagesPerSecond: '10' })).toEqual({});
    expect(paramErrors(REPLAY, { limit: '1.5', messagesPerSecond: '10' })).toEqual({ limit: 'Must be a whole number' });
    expect(paramErrors(REPLAY, { limit: '5001', messagesPerSecond: '10' })).toEqual({ limit: 'Must be at most 5000' });
    expect(paramErrors(REPLAY, { limit: '10', messagesPerSecond: '0.05' })).toEqual({ messagesPerSecond: 'Must be at least 0.1' });
    expect(paramErrors(REPLAY, { limit: 'many', messagesPerSecond: '10' })).toEqual({ limit: 'Must be a number' });
    expect(paramErrors(REPLAY, { limit: '10', messagesPerSecond: '1', date: '07/04/2024' })).toEqual({ date: 'Use YYYY-MM-DD' });
  });

  it('only accepts listed enum options', () => {
    const schema: ParamSpec[] = [{ name: 'mode', type: 'enum', label: 'Mode', options: ['fast', 'full'] }];
    expect(paramErrors(schema, { mode: 'full' })).toEqual({});
    expect(paramErrors(schema, { mode: 'slow' })).toEqual({ mode: 'Pick one of the options' });
  });
});

