import { describe, expect, it } from 'vitest';
import { buildCsv, formatCellValue, formatDurationMs, isNumericCell, isQueryError, qualifiedTableName } from './rules';

describe('isQueryError', () => {
  it('discriminates on the error key', () => {
    expect(isQueryError({ error: 'boom' })).toBe(true);
    expect(isQueryError({ columns: [], rows: [], rowCount: 0, durationMs: 1, truncated: false })).toBe(false);
  });
});

describe('formatCellValue', () => {
  it('labels NULL explicitly and renders scalars', () => {
    expect(formatCellValue(null)).toBe('NULL');
    expect(formatCellValue(undefined)).toBe('NULL');
    expect(formatCellValue(true)).toBe('true');
    expect(formatCellValue('x')).toBe('x');
    expect(formatCellValue({ a: 1 })).toBe('{"a":1}');
  });
  it('rounds numbers to at most 6 decimals', () => {
    expect(formatCellValue(1.23456789)).toBe((1.23456789).toLocaleString(undefined, { maximumFractionDigits: 6 }));
  });
  it('isNumericCell only accepts numbers', () => {
    expect(isNumericCell(1)).toBe(true);
    expect(isNumericCell('1')).toBe(false);
  });
});

describe('buildCsv', () => {
  it('quotes fields with commas, quotes and newlines and uses CRLF', () => {
    const csv = buildCsv(['a', 'b,c'], [['plain', 'has "quote"'], [null, 'multi\nline']]);
    expect(csv).toBe('a,"b,c"\r\nplain,"has ""quote"""\r\n,"multi\nline"');
  });
  it('keeps raw numbers unrounded', () => {
    expect(buildCsv(['n'], [[1.23456789]])).toBe('n\r\n1.23456789');
  });
});

describe('formatDurationMs / qualifiedTableName', () => {
  it('formats durations', () => {
    expect(formatDurationMs(12)).toBe('12ms');
    expect(formatDurationMs(1500)).toBe('1.50s');
  });
  it('leaves public unqualified', () => {
    expect(qualifiedTableName('public', 't')).toBe('t');
    expect(qualifiedTableName('control_plane', 'job_runs')).toBe('control_plane.job_runs');
  });
});
