import type { Project } from './entities';

/** Base URL prefix for every project-scoped screen. */
export const PROJECT_ROUTE_PREFIX = '/p';

/** Builds the browser path for a screen inside a project, e.g.
 * projectPath('nyc-taxi', 'pipelines') -> '/p/nyc-taxi/pipelines' and
 * projectPath('nyc-taxi', '') -> '/p/nyc-taxi'. */
export function projectPath(slug: string, subpath = ''): string {
  const trimmed = subpath.replace(/^\/+/, '');
  return trimmed ? `${PROJECT_ROUTE_PREFIX}/${slug}/${trimmed}` : `${PROJECT_ROUTE_PREFIX}/${slug}`;
}

/** Splits a pathname into its project slug and the screen path after it.
 * Returns null for paths outside the project area (e.g. /infrastructure). */
export function parseProjectPath(pathname: string): { slug: string; subpath: string } | null {
  const match = pathname.match(/^\/p\/([^/]+)(?:\/(.*))?$/);
  if (!match) return null;
  return { slug: match[1], subpath: match[2] ?? '' };
}

/** Builds the API path for a project-scoped control-plane route. The
 * control-plane accepts either the id or the slug in that segment, and the
 * slug is what the URL already carries, so that's what gets sent. */
export function projectApiPath(slug: string, subpath: string): string {
  const trimmed = subpath.replace(/^\/+/, '');
  return `/api/projects/${encodeURIComponent(slug)}/${trimmed}`;
}

export function hasFeature(project: Project | undefined, feature: string): boolean {
  return Boolean(project?.features?.[feature]);
}

/** Picks which project to land on when the URL names none: the last one
 * used if it still exists, else the first in the list, else nothing. */
export function pickDefaultProject(projects: Project[], lastUsedSlug: string | null): Project | undefined {
  if (lastUsedSlug) {
    const last = projects.find((p) => p.slug === lastUsedSlug);
    if (last) return last;
  }
  return projects[0];
}

/** Client-side mirror of the Go slug rule, so the new-project form can
 * preview what the server will accept before submitting. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, 48).replace(/-+$/, '');
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 48 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) && !slug.includes('--');
}
