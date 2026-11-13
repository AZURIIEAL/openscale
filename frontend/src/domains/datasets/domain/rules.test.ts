import { describe, expect, it } from 'vitest';
import type { Dataset, ProfileColumn } from './entities';
import { formatNullShare, formatRows, formatStat, hasPendingDataset, isSupportedFilename, isValidDatasetName, nameFromFilename, profileWarnings, sourceLabel, statusLabel, statusTone } from './rules';

const ds = (over: Partial<Dataset> = {}): Dataset => ({
  id: 'id',
  projectId: 'p',
  name: 'orders',
  layer: 'bronze',
  status: 'ready',
  source: { kind: 'upload', filename: 'orders.csv' },
  columns: [],
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('nameFromFilename', () => {
  it('matches the Go NameFromFilename rule', () => {
    expect(nameFromFilename('Sales Q3-2025.csv')).toBe('sales_q3_2025');
    expect(nameFromFilename('yellow_tripdata_2024-07.parquet')).toBe('yellow_tripdata_2024_07');
    expect(nameFromFilename('data.csv.gz')).toBe('data');
    expect(nameFromFilename('C:\\Users\\me\\Report.CSV')).toBe('report');
    expect(nameFromFilename('2024.csv')).toBe('d_2024');
    expect(nameFromFilename('!!!.csv')).toBe('dataset');
    expect(nameFromFilename('')).toBe('dataset');
  });
  it('always yields a valid name', () => {
    for (const f of ['a.csv', '9.csv', '___.csv', 'x'.repeat(100) + '.csv', 'über.csv']) {
      expect(isValidDatasetName(nameFromFilename(f))).toBe(true);
    }
  });
});

describe('isValidDatasetName / isSupportedFilename', () => {
  it('validates like the server', () => {
    expect(isValidDatasetName('orders')).toBe(true);
    expect(isValidDatasetName('x'.repeat(63))).toBe(true);
    for (const bad of ['', 'Orders', '2024', '_x', 'a-b', 'a b', 'x'.repeat(64)]) expect(isValidDatasetName(bad)).toBe(false);
  });
  it('accepts the supported extensions case-insensitively', () => {
    for (const ok of ['a.csv', 'A.PARQUET', 'a.jsonl', 'a.csv.gz']) expect(isSupportedFilename(ok)).toBe(true);
    for (const bad of ['a.xlsx', 'a.zip', 'a']) expect(isSupportedFilename(bad)).toBe(false);
  });
});

describe('status helpers', () => {
  it('maps status to tone and label', () => {
    expect(statusTone('ready')).toBe('success');
    expect(statusTone('failed')).toBe('danger');
    expect(statusTone('pending')).toBe('warning');
    expect(statusLabel('pending')).toBe('ingesting');
  });
  it('detects pending datasets for polling', () => {
    expect(hasPendingDataset(undefined)).toBe(false);
    expect(hasPendingDataset([ds()])).toBe(false);
    expect(hasPendingDataset([ds(), ds({ status: 'pending' })])).toBe(true);
  });
});

describe('formatters', () => {
  it('formats rows, null share and stats', () => {
    expect(formatRows(undefined)).toBe('—');
    expect(formatRows(1234)).toBe((1234).toLocaleString());
    expect(formatNullShare(0)).toBe('0%');
    expect(formatNullShare(0.0001)).toBe('<0.1%');
    expect(formatNullShare(0.256)).toBe('25.6%');
    expect(formatStat(null)).toBe('—');
    expect(formatStat(3)).toBe('3');
    expect(formatStat('x'.repeat(50)).endsWith('…')).toBe(true);
  });
  it('labels the source', () => {
    expect(sourceLabel(ds())).toBe('upload · orders.csv');
    expect(sourceLabel(ds({ source: { kind: 'url', url: 'https://x/y.csv' } }))).toBe('https://x/y.csv');
  });
});

describe('profileWarnings', () => {
  const col = (over: Partial<ProfileColumn>): ProfileColumn => ({ name: 'c', type: 'VARCHAR', nullCount: 0, nullShare: 0, ...over });
  it('flags all-null, constant and mostly-null columns', () => {
    expect(profileWarnings(col({ nullCount: 10, nullShare: 1 }), 10)).toEqual(['all null']);
    expect(profileWarnings(col({ distinct: 1 }), 10)).toEqual(['constant']);
    expect(profileWarnings(col({ nullCount: 6, nullShare: 0.6 }), 10)).toEqual(['mostly null']);
    expect(profileWarnings(col({ distinct: 5 }), 10)).toEqual([]);
  });
  it('is quiet on an empty dataset', () => {
    expect(profileWarnings(col({ distinct: 1 }), 0)).toEqual([]);
  });
});
