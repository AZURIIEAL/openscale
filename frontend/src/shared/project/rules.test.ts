import { describe, expect, it } from 'vitest';
import type { Project } from './entities';
import { hasFeature, isValidSlug, parseProjectPath, pickDefaultProject, projectApiPath, projectPath, slugify } from './rules';

const project = (slug: string, features: Record<string, boolean> = {}): Project => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  description: '',
  features,
  aiSettings: {},
  createdAt: '2026-11-12T00:00:00Z',
});

describe('projectPath', () => {
  it('builds the home path with no subpath', () => {
    expect(projectPath('nyc-taxi')).toBe('/p/nyc-taxi');
    expect(projectPath('nyc-taxi', '')).toBe('/p/nyc-taxi');
  });
  it('appends a screen path and tolerates a leading slash', () => {
    expect(projectPath('nyc-taxi', 'pipelines')).toBe('/p/nyc-taxi/pipelines');
    expect(projectPath('nyc-taxi', '/pipelines')).toBe('/p/nyc-taxi/pipelines');
  });
});

describe('parseProjectPath', () => {
  it('splits slug and subpath', () => {
    expect(parseProjectPath('/p/nyc-taxi/pipelines')).toEqual({ slug: 'nyc-taxi', subpath: 'pipelines' });
    expect(parseProjectPath('/p/nyc-taxi/data-catalog/extra')).toEqual({ slug: 'nyc-taxi', subpath: 'data-catalog/extra' });
  });
  it('returns an empty subpath on the project home', () => {
    expect(parseProjectPath('/p/nyc-taxi')).toEqual({ slug: 'nyc-taxi', subpath: '' });
    expect(parseProjectPath('/p/nyc-taxi/')).toEqual({ slug: 'nyc-taxi', subpath: '' });
  });
  it('returns null outside the project area', () => {
    expect(parseProjectPath('/')).toBeNull();
    expect(parseProjectPath('/infrastructure')).toBeNull();
    expect(parseProjectPath('/projects/new')).toBeNull();
    expect(parseProjectPath('/p')).toBeNull();
    expect(parseProjectPath('/p/')).toBeNull();
  });
  it('round-trips with projectPath', () => {
    for (const sub of ['', 'pipelines', 'sql-editor']) {
      expect(parseProjectPath(projectPath('abc', sub))).toEqual({ slug: 'abc', subpath: sub });
    }
  });
});

describe('projectApiPath', () => {
  it('targets the control-plane project group', () => {
    expect(projectApiPath('nyc-taxi', 'jobs/runs?limit=5')).toBe('/api/projects/nyc-taxi/jobs/runs?limit=5');
    expect(projectApiPath('nyc-taxi', '/home/stats')).toBe('/api/projects/nyc-taxi/home/stats');
  });
  it('encodes the slug', () => {
    expect(projectApiPath('a b', 'x')).toBe('/api/projects/a%20b/x');
  });
});

describe('hasFeature', () => {
  it('reads a true flag', () => {
    expect(hasFeature(project('a', { legacy_taxi: true }), 'legacy_taxi')).toBe(true);
  });
  it('treats false, missing and undefined project as unset', () => {
    expect(hasFeature(project('a', { legacy_taxi: false }), 'legacy_taxi')).toBe(false);
    expect(hasFeature(project('a'), 'legacy_taxi')).toBe(false);
    expect(hasFeature(undefined, 'legacy_taxi')).toBe(false);
  });
});

describe('pickDefaultProject', () => {
  const list = [project('first'), project('second')];
  it('prefers the last-used project when it still exists', () => {
    expect(pickDefaultProject(list, 'second')?.slug).toBe('second');
  });
  it('falls back to the first project when the last-used one is gone', () => {
    expect(pickDefaultProject(list, 'archived')?.slug).toBe('first');
    expect(pickDefaultProject(list, null)?.slug).toBe('first');
  });
  it('returns undefined with no projects', () => {
    expect(pickDefaultProject([], 'anything')).toBeUndefined();
  });
});

describe('slugify / isValidSlug', () => {
  it('matches the Go Slugify rule on common names', () => {
    expect(slugify('NYC Taxi')).toBe('nyc-taxi');
    expect(slugify('  Sales   Q3 / 2025  ')).toBe('sales-q3-2025');
    expect(slugify('Trailing symbols!!!')).toBe('trailing-symbols');
    expect(slugify('___')).toBe('');
  });
  it('caps at 48 characters without a trailing hyphen', () => {
    const slug = slugify('ab '.repeat(40));
    expect(slug.length <= 48).toBe(true);
    expect(slug.endsWith('-')).toBe(false);
    expect(isValidSlug(slug)).toBe(true);
  });
  it('validates like the server', () => {
    for (const ok of ['a', 'nyc-taxi', 'sales2025', 'x'.repeat(48)]) expect(isValidSlug(ok)).toBe(true);
    for (const bad of ['', '-lead', 'trail-', 'Upper', 'has space', 'under_score', 'double--hyphen', 'x'.repeat(49)]) {
      expect(isValidSlug(bad)).toBe(false);
    }
  });
});
