export interface NavEntry {
  path: string;
  label: string;
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
  { path: '/', label: 'Home' },
  { path: '/pipelines', label: 'Pipelines' },
  { path: '/sql-editor', label: 'SQL Editor' },
  { path: '/data-catalog', label: 'Data Catalog' },
  { path: '/notebooks', label: 'Notebooks' },
  { path: '/ml-workbench', label: 'ML Workbench' },
  { path: '/streaming', label: 'Streaming' },
  { path: '/dashboards', label: 'Dashboards' },
  { path: '/infrastructure', label: 'Infrastructure', group: 'system' },
  { path: '/connections', label: 'Connections', group: 'system' },
];
