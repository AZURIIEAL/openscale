import { FEATURE_LEGACY_TAXI } from '@/shared/project/entities';
import { hasFeature } from '@/shared/project/rules';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { ProjectStreamingScreen } from './ProjectStreamingScreen';
import { StreamingScreen } from './StreamingScreen';

/** The legacy taxi project keeps its replay screen until 4e-2 deletes it;
 * every other project streams its own datasets. */
export function StreamingRoute() {
  const { project } = useCurrentProject();
  return hasFeature(project, FEATURE_LEGACY_TAXI) ? <StreamingScreen /> : <ProjectStreamingScreen />;
}
