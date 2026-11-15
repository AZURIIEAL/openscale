import { FEATURE_LEGACY_TAXI } from '@/shared/project/entities';
import { hasFeature } from '@/shared/project/rules';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { DashboardsScreen } from './DashboardsScreen';
import { SavedQueriesDashboard } from './SavedQueriesDashboard';

/** The legacy taxi project keeps its fixed Gold-table dashboard until 4e-2
 * deletes it; every other project's dashboard is its charted saved queries. */
export function DashboardsRoute() {
  const { project } = useCurrentProject();
  return hasFeature(project, FEATURE_LEGACY_TAXI) ? <DashboardsScreen /> : <SavedQueriesDashboard />;
}
