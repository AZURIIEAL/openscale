import { FEATURE_LEGACY_TAXI } from '@/shared/project/entities';
import { hasFeature } from '@/shared/project/rules';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import type { QueryTarget } from './QueryGateway';

/** The current project's query backend (see QueryTarget). */
export function useQueryTarget(): QueryTarget {
  const { slug, project } = useCurrentProject();
  return { projectSlug: slug, legacy: hasFeature(project, FEATURE_LEGACY_TAXI) };
}
