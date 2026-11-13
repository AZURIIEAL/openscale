import { Link, Outlet } from 'react-router-dom';
import { Panel } from '@/shared/design-system/Panel';
import { Spinner } from '@/shared/design-system/Spinner';
import { useCurrentProject } from './useCurrentProject';

/**
 * Route element for `/p/:projectSlug`. Resolves the slug once for the
 * whole subtree and renders an honest not-found state for a slug that
 * doesn't exist (a stale bookmark, an archived project) instead of letting
 * every screen fail its first fetch with a 404.
 */
export function ProjectLayout() {
  const { slug, isLoading, notFound } = useCurrentProject();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Spinner /> Loading project…
      </div>
    );
  }

  if (notFound) {
    return (
      <Panel className="flex flex-col items-start gap-2 p-6">
        <span className="os-font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--text-subtle)' }}>
          Project not found
        </span>
        <h2 className="m-0 text-lg" style={{ color: 'var(--text-heading)' }}>
          No project is called “{slug}”
        </h2>
        <p className="m-0 max-w-md text-sm" style={{ color: 'var(--text-muted)' }}>
          It may have been archived or renamed. Pick another project from the switcher, or{' '}
          <Link to="/projects/new">create a new one</Link>.
        </p>
      </Panel>
    );
  }

  return <Outlet />;
}
