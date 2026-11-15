import { describe, expect, it } from 'vitest';
import { datasetTopic, feedColumns } from './rules';

describe('datasetTopic', () => {
  it('prefixes the dataset with the project slug', () => {
    expect(datasetTopic('nyc-taxi-sample', 'trips')).toBe('nyc-taxi-sample.trips');
  });
});

describe('feedColumns', () => {
  it('collects object keys in first-seen order, capped', () => {
    expect(feedColumns([{ a: 1, b: 2 }, 'text', { b: 3, c: 4 }])).toEqual(['a', 'b', 'c']);
    expect(feedColumns([{ a: 1, b: 2, c: 3 }], 2)).toEqual(['a', 'b']);
  });
  it('is empty for non-object messages', () => {
    expect(feedColumns(['x', 1, null, [1]])).toEqual([]);
  });
});
