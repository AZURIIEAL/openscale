import {
  HomeIcon,
  PipelinesIcon,
  SqlEditorIcon,
  DataCatalogIcon,
  NotebooksIcon,
  MlWorkbenchIcon,
  StreamingIcon,
  DashboardsIcon,
  InfrastructureIcon,
  ConnectionsIcon,
} from '@/shared/design-system';
import type { ComponentPropsWithoutRef, JSX } from 'react';

export interface NavEntry {
  path: string;
  label: string;
  icon: (props: ComponentPropsWithoutRef<'svg'>) => JSX.Element;
  /** Groups the "System" section (Infrastructure, Connections) apart from
   * the primary workflow screens in the sidebar. */
  group?: 'system';
}

/**
 * Single source of truth for primary navigation -- the sidebar, the
 * router's route table, and the top bar's screen title all derive from
 * this instead of maintaining three parallel lists.
 */
export const NAV_ENTRIES: NavEntry[] = [
  { path: '/', label: 'Home', icon: HomeIcon },
  { path: '/pipelines', label: 'Pipelines', icon: PipelinesIcon },
  { path: '/sql-editor', label: 'SQL Editor', icon: SqlEditorIcon },
  { path: '/data-catalog', label: 'Data Catalog', icon: DataCatalogIcon },
  { path: '/notebooks', label: 'Notebooks', icon: NotebooksIcon },
  { path: '/ml-workbench', label: 'ML Workbench', icon: MlWorkbenchIcon },
  { path: '/streaming', label: 'Streaming', icon: StreamingIcon },
  { path: '/dashboards', label: 'Dashboards', icon: DashboardsIcon },
  { path: '/infrastructure', label: 'Infrastructure', icon: InfrastructureIcon, group: 'system' },
  { path: '/connections', label: 'Connections', icon: ConnectionsIcon, group: 'system' },
];
