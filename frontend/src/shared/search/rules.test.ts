import { describe, expect, it } from 'vitest';
import { CATEGORY_LABEL, matchesQuery } from './rules';

describe('matchesQuery', () => {
  it('matches case-insensitive substrings in any field', () => {
    expect(matchesQuery('TAX', 'NYC Taxi', 'nyc-taxi')).toBe(true);
    expect(matchesQuery('silver', 'Validate (Silver)')).toBe(true);
  });
  it('ignores empty queries and undefined fields', () => {
    expect(matchesQuery('   ', 'anything')).toBe(false);
    expect(matchesQuery('x', undefined, undefined)).toBe(false);
  });
});

describe('CATEGORY_LABEL', () => {
  it('labels every category including projects', () => {
    expect(CATEGORY_LABEL.project).toBe('Projects');
    expect(Object.keys(CATEGORY_LABEL).sort()).toEqual(['job', 'project', 'run', 'screen', 'table']);
  });
});
