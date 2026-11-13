import { describe, expect, it } from 'vitest';
import { formatCount, formatCurrency, formatDurationSeconds, formatHourLabel, formatPercent } from './rules';

describe('formatCurrency', () => {
  it('scales to K and M', () => {
    expect(formatCurrency(12.5)).toBe('$12.50');
    expect(formatCurrency(1_500)).toBe('$1.5K');
    expect(formatCurrency(2_250_000)).toBe('$2.3M');
    expect(formatCurrency(-1_500)).toBe('$-1.5K');
  });
  it('dashes undefined', () => {
    expect(formatCurrency(undefined)).toBe('—');
  });
});

describe('formatCount', () => {
  it('scales to K and M', () => {
    expect(formatCount(999)).toBe((999).toLocaleString());
    expect(formatCount(1_000)).toBe('1.0K');
    expect(formatCount(3_400_000)).toBe('3.4M');
    expect(formatCount(undefined)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('rounds to one decimal', () => {
    expect(formatPercent(12.345)).toBe('12.3%');
    expect(formatPercent(undefined)).toBe('—');
  });
});

describe('formatHourLabel', () => {
  it('converts 24h to 12h with AM/PM', () => {
    expect(formatHourLabel(0)).toBe('12 AM');
    expect(formatHourLabel(1)).toBe('1 AM');
    expect(formatHourLabel(12)).toBe('12 PM');
    expect(formatHourLabel(13)).toBe('1 PM');
    expect(formatHourLabel(23)).toBe('11 PM');
  });
});

describe('formatDurationSeconds', () => {
  it('formats seconds and minutes', () => {
    expect(formatDurationSeconds(42.4)).toBe('42s');
    expect(formatDurationSeconds(125)).toBe('2m 5s');
    expect(formatDurationSeconds(undefined)).toBe('—');
  });
});
