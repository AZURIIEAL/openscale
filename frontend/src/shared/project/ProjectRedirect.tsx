import { Navigate } from 'react-router-dom';
import { Spinner } from '@/shared/design-system/Spinner';
import { useProjectsList } from './useProjects';
import { useProjectStore } from './projectStore';
import { pickDefaultProject, projectPath } from './rules';

/** `/` -> the last-used project, else the first one, else the create form. */
export function ProjectRedirect() {
  const { data: projects, isLoading, isError } = useProjectsList();
  const lastProjectSlug = useProjectStore((s) => s.lastProjectSlug);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Spinner /> Loading projects…
      </div>
    );
  }
  if (isError) {
    return (
      <p className="p-6 text-sm" style={{ color: 'var(--danger)' }}>
        Could not reach the control-plane to list projects.
      </p>
    );
  }

  const target = pickDefaultProject(projects ?? [], lastProjectSlug);
  return <Navigate to={target ? projectPath(target.slug) : '/projects/new'} replace />;
}
