import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useProjectsList } from './useProjects';
import { useProjectStore } from './projectStore';
import type { Project } from './entities';

export interface CurrentProject {
  /** The slug from the URL. Empty string outside the project area. Every
   * project-scoped gateway call and TanStack Query key takes this, so
   * switching projects never serves another project's cached data. */
  slug: string;
  /** Resolved project, once the list has loaded and the slug matched. */
  project: Project | undefined;
  isLoading: boolean;
  /** True once the list has loaded and no project has this slug. */
  notFound: boolean;
}

/**
 * The project named by the `/p/:projectSlug` route. Reads the slug from
 * the URL (so refresh and deep links work) and resolves it against the
 * cached project list. Also records it as the last-used project.
 */
export function useCurrentProject(): CurrentProject {
  const { projectSlug = '' } = useParams<{ projectSlug: string }>();
  const { data: projects, isLoading } = useProjectsList();
  const setLastProjectSlug = useProjectStore((s) => s.setLastProjectSlug);

  const project = projects?.find((p) => p.slug === projectSlug);

  useEffect(() => {
    if (project) setLastProjectSlug(project.slug);
  }, [project, setLastProjectSlug]);

  return {
    slug: projectSlug,
    project,
    isLoading,
    notFound: !isLoading && projects !== undefined && projectSlug !== '' && project === undefined,
  };
}
