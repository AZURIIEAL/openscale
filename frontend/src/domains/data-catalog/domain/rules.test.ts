import { describe, expect, it } from 'vitest';
import { formatBytes, formatLastModified, quotedTableRef } from './rules';

describe('formatBytes', () => {
  it('picks binary units with sensible precision', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(15 * 1024)).toBe('15.0 KB');
    expect(formatBytes(3.5 * 1024 ** 2)).toBe('3.50 MB');
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.00 TB');
  });
  it('does not exceed the largest unit', () => {
    expect(formatBytes(5 * 1024 ** 5).endsWith('TB')).toBe(true);
  });
});

describe('formatLastModified', () => {
  it('falls back to the raw string when unparseable', () => {
    expect(formatLastModified('not a date')).toBe('not a date');
  });
});

describe('quotedTableRef', () => {
  it('double-quotes both parts', () => {
    expect(quotedTableRef('public', 'zone_hour_features')).toBe('"public"."zone_hour_features"');
  });
});
