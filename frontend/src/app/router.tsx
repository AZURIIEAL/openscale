import { createBrowserRouter } from 'react-router-dom';
import { AppShellContainer } from './AppShellContainer';
import { HomeScreen } from '@/domains/home/ui/HomeScreen';
import { PipelinesScreen } from '@/domains/pipelines/ui/PipelinesScreen';
import { SqlEditorScreen } from '@/domains/sql-editor/ui/SqlEditorScreen';
import { DataCatalogScreen } from '@/domains/data-catalog/ui/DataCatalogScreen';
import { NotebooksScreen } from '@/domains/notebooks/ui/NotebooksScreen';
import { MlWorkbenchScreen } from '@/domains/ml-workbench/ui/MlWorkbenchScreen';
import { StreamingScreen } from '@/domains/streaming/ui/StreamingScreen';
import { DashboardsScreen } from '@/domains/dashboards/ui/DashboardsScreen';
import { InfrastructureScreen } from '@/domains/system-health/ui/InfrastructureScreen';
import { ConnectionsScreen } from '@/domains/connections/ui/ConnectionsScreen';
import { FEATURE_LEGACY_TAXI } from '@/shared/project/entities';
import { ProjectLayout } from '@/shared/project/ProjectLayout';
import { ProjectRedirect } from '@/shared/project/ProjectRedirect';
import { NewProjectScreen } from '@/shared/project/NewProjectScreen';
import { RequireFeature } from '@/shared/project/RequireFeature';

/**
 * Route paths mirror shared/layout/navigation.ts's NAV_ENTRIES exactly --
 * that file is the single source of truth for the path strings themselves.
 *
 * Project screens live under /p/:projectSlug so the project survives a
 * refresh, a deep link and the ⌘K palette; `/` redirects to the last-used
 * project. System screens (Infrastructure, Settings) sit outside any
 * project.
 *
 * Pipelines, Dashboards and Streaming are still hardcoded to the taxi
 * pipeline, so they are gated to the project flagged `legacy_taxi` until
 * Phase 4 of the implementation plan makes them per-project rows.
 */
export const router = createBrowserRouter([
  {
    element: <AppShellContainer />,
    children: [
      { path: '/', element: <ProjectRedirect /> },
      { path: '/projects/new', element: <NewProjectScreen /> },
      {
        path: '/p/:projectSlug',
        element: <ProjectLayout />,
        children: [
          { index: true, element: <HomeScreen /> },
          {
            path: 'pipelines',
            element: (
              <RequireFeature
                feature={FEATURE_LEGACY_TAXI}
                screenName="Pipelines"
                description="Per-project pipelines arrive with the generic job registry. Until then only the NYC Taxi sample project has runnable stages."
              >
                <PipelinesScreen />
              </RequireFeature>
            ),
          },
          { path: 'sql-editor', element: <SqlEditorScreen /> },
          { path: 'data-catalog', element: <DataCatalogScreen /> },
          { path: 'notebooks', element: <NotebooksScreen /> },
          { path: 'ml-workbench', element: <MlWorkbenchScreen /> },
          {
            path: 'streaming',
            element: (
              <RequireFeature
                feature={FEATURE_LEGACY_TAXI}
                screenName="Streaming"
                description="Replay currently streams taxi trips onto one fixed topic. Generic topic selection comes with the dataset model."
              >
                <StreamingScreen />
              </RequireFeature>
            ),
          },
          {
            path: 'dashboards',
            element: (
              <RequireFeature
                feature={FEATURE_LEGACY_TAXI}
                screenName="Dashboards"
                description="Dashboards are built from the taxi Gold tables today. Saved queries and chart tiles for any project come in Phase 5."
              >
                <DashboardsScreen />
              </RequireFeature>
            ),
          },
        ],
      },
      { path: '/infrastructure', element: <InfrastructureScreen /> },
      { path: '/connections', element: <ConnectionsScreen /> },
    ],
  },
]);
