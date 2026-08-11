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

/**
 * Route paths mirror shared/layout/navigation.ts's NAV_ENTRIES exactly --
 * that file is the single source of truth for the path strings themselves.
 */
export const router = createBrowserRouter([
  {
    element: <AppShellContainer />,
    children: [
      { path: '/', element: <HomeScreen /> },
      { path: '/pipelines', element: <PipelinesScreen /> },
      { path: '/sql-editor', element: <SqlEditorScreen /> },
      { path: '/data-catalog', element: <DataCatalogScreen /> },
      { path: '/notebooks', element: <NotebooksScreen /> },
      { path: '/ml-workbench', element: <MlWorkbenchScreen /> },
      { path: '/streaming', element: <StreamingScreen /> },
      { path: '/dashboards', element: <DashboardsScreen /> },
      { path: '/infrastructure', element: <InfrastructureScreen /> },
      { path: '/connections', element: <ConnectionsScreen /> },
    ],
  },
]);
