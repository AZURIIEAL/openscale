import { createBrowserRouter } from 'react-router-dom';
import { AppShellContainer } from './AppShellContainer';
import { HomeScreen } from '@/domains/home/ui/HomeScreen';
import { PipelinesScreen } from '@/domains/pipelines/ui/PipelinesScreen';
import { SqlEditorScreen } from '@/domains/sql-editor/ui/SqlEditorScreen';
import { DataCatalogScreen } from '@/domains/data-catalog/ui/DataCatalogScreen';
import { NotebooksScreen } from '@/domains/notebooks/ui/NotebooksScreen';
import { MlWorkbenchScreen } from '@/domains/ml-workbench/ui/MlWorkbenchScreen';
import { StreamingRoute } from '@/domains/streaming/ui/StreamingRoute';
import { DashboardsRoute } from '@/domains/dashboards/ui/DashboardsRoute';
import { InfrastructureScreen } from '@/domains/system-health/ui/InfrastructureScreen';
import { ConnectionsScreen } from '@/domains/connections/ui/ConnectionsScreen';
import { ProjectLayout } from '@/shared/project/ProjectLayout';
import { ProjectRedirect } from '@/shared/project/ProjectRedirect';
import { NewProjectScreen } from '@/shared/project/NewProjectScreen';

/**
 * Route paths mirror shared/layout/navigation.ts's NAV_ENTRIES exactly --
 * that file is the single source of truth for the path strings themselves.
 *
 * Project screens live under /p/:projectSlug so the project survives a
 * refresh, a deep link and the ⌘K palette; `/` redirects to the last-used
 * project. System screens (Infrastructure, Settings) sit outside any
 * project.
 *
 * Dashboards and Streaming pick their screen per project: the legacy
 * `nyc-taxi` project (flagged `legacy_taxi`) keeps its taxi screens until
 * 4e-2 deletes them.
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
          { path: 'pipelines', element: <PipelinesScreen /> },
          { path: 'sql-editor', element: <SqlEditorScreen /> },
          { path: 'data-catalog', element: <DataCatalogScreen /> },
          { path: 'notebooks', element: <NotebooksScreen /> },
          { path: 'ml-workbench', element: <MlWorkbenchScreen /> },
          {
            path: 'streaming',
            element: <StreamingRoute />,
          },
          {
            path: 'dashboards',
            element: <DashboardsRoute />,
          },
        ],
      },
      { path: '/infrastructure', element: <InfrastructureScreen /> },
      { path: '/connections', element: <ConnectionsScreen /> },
    ],
  },
]);
