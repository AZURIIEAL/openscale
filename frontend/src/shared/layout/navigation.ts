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
import { parseProjectPath, projectPath } from '@/shared/project/rules';

export type NavScope = 'project' | 'system';

export interface NavEntry {
  /** For `project` entries: the segment after `/p/{slug}` ('' is Home).
   * For `system` entries: the absolute path. Use navHref() to resolve. */
  path: string;
  label: string;
  icon: LucideIcon;
  /** One-line copy shown under the screen title in the top bar. */
  subtitle: string;
  /** Project screens live under /p/{slug}; system screens (Infrastructure,
   * Settings) describe the whole stack and sit outside any project. */
  scope: NavScope;
}

/**
 * Single source of truth for primary navigation -- the sidebar, the
 * router's route table, and the top bar's screen title all derive from
 * this instead of maintaining three parallel lists.
 */
export const NAV_ENTRIES: NavEntry[] = [
  { path: '', label: 'Home', icon: HomeIcon, subtitle: 'Project health at a glance: recent runs, stats and live container load.', scope: 'project' },
  {
    path: 'pipelines',
    label: 'Pipelines',
    icon: PipelinesIcon,
    subtitle: 'Run jobs by hand or on a chain, with live status and logs.',
    scope: 'project',
  },
  {
    path: 'sql-editor',
    label: 'SQL Editor',
    icon: SqlEditorIcon,
    subtitle: 'Read-only SQL over the project’s datasets, via DuckDB.',
    scope: 'project',
  },
  {
    path: 'data-catalog',
    label: 'Data Catalog',
    icon: DataCatalogIcon,
    subtitle: 'Upload or fetch datasets, inspect schemas and profiles.',
    scope: 'project',
  },
  { path: 'notebooks', label: 'Notebooks', icon: NotebooksIcon, subtitle: 'JupyterLab, opened on the example notebooks.', scope: 'project' },
  {
    path: 'ml-workbench',
    label: 'ML Workbench',
    icon: MlWorkbenchIcon,
    subtitle: 'MLflow experiments and models from the train job.',
    scope: 'project',
  },
  {
    path: 'streaming',
    label: 'Streaming',
    icon: StreamingIcon,
    subtitle: 'Kafka replay of real rows, streamed live over WebSocket.',
    scope: 'project',
  },
  {
    path: 'dashboards',
    label: 'Dashboards',
    icon: DashboardsIcon,
    subtitle: 'Metrics over the full ingested history.',
    scope: 'project',
  },
  {
    path: '/infrastructure',
    label: 'Infrastructure',
    icon: InfrastructureIcon,
    subtitle: 'Container health, restart and stop controls.',
    scope: 'system',
  },
  {
    path: '/connections',
    label: 'Settings',
    icon: ConnectionsIcon,
    subtitle: 'Console appearance and interface preferences.',
    scope: 'system',
  },
];

/** Resolves a nav entry to a browser path. Project entries need the
 * current slug; with none known they fall back to `/`, which redirects to
 * the last-used project. */
export function navHref(entry: NavEntry, projectSlug: string | undefined): string {
  if (entry.scope === 'system') return entry.path;
  return projectSlug ? projectPath(projectSlug, entry.path) : '/';
}

/** Finds the nav entry a pathname is on, for the top bar's title. */
export function findNavEntry(pathname: string): NavEntry | undefined {
  const parsed = parseProjectPath(pathname);
  if (parsed) {
    const first = parsed.subpath.split('/')[0] ?? '';
    return NAV_ENTRIES.find((e) => e.scope === 'project' && e.path === first);
  }
  return NAV_ENTRIES.find((e) => e.scope === 'system' && e.path === pathname);
}
