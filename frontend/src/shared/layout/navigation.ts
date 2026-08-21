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
import type { LucideIcon } from 'lucide-react';

export interface NavEntry {
  path: string;
  label: string;
  icon: LucideIcon;
  /** One-line copy shown under the screen title in the top bar. */
  subtitle: string;
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
  { path: '/', label: 'Home', icon: HomeIcon, subtitle: 'Nine services, one pipeline chain, live container load.' },
  {
    path: '/pipelines',
    label: 'Pipelines',
    icon: PipelinesIcon,
    subtitle: 'Bronze through model training, run by hand or on a chain.',
  },
  { path: '/sql-editor', label: 'SQL Editor', icon: SqlEditorIcon, subtitle: 'Query the lake directly. Coming soon.' },
  {
    path: '/data-catalog',
    label: 'Data Catalog',
    icon: DataCatalogIcon,
    subtitle: 'Browse tables, schemas and lineage. Coming soon.',
  },
  { path: '/notebooks', label: 'Notebooks', icon: NotebooksIcon, subtitle: 'Jupyter, wired to the lake. Coming soon.' },
  {
    path: '/ml-workbench',
    label: 'ML Workbench',
    icon: MlWorkbenchIcon,
    subtitle: 'Train and evaluate models. Coming soon.',
  },
  { path: '/streaming', label: 'Streaming', icon: StreamingIcon, subtitle: 'Live Kafka topics and consumers. Coming soon.' },
  {
    path: '/dashboards',
    label: 'Dashboards',
    icon: DashboardsIcon,
    subtitle: 'Gold-layer metrics over the full ingested history.',
  },
  {
    path: '/infrastructure',
    label: 'Infrastructure',
    icon: InfrastructureIcon,
    subtitle: 'Container health, restart and stop controls.',
    group: 'system',
  },
  {
    path: '/connections',
    label: 'Connections',
    icon: ConnectionsIcon,
    subtitle: 'Console appearance and interface preferences.',
    group: 'system',
  },
];
