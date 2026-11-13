import { describe, expect, it } from 'vitest';
import { deriveRunStatus, formatRunDuration, formatRunRows, stateLabel } from './rules';
import type { JobState } from './entities';

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
