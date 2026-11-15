import type { ChartSpec, SavedQuery } from '../domain/entities';

/** Port for a project's saved queries. */
export interface SavedQueriesGateway {
  list(projectSlug: string): Promise<SavedQuery[]>;
  /** Creates or replaces the query with this name. */
  save(projectSlug: string, name: string, sql: string, chart?: ChartSpec): Promise<SavedQuery>;
  remove(projectSlug: string, name: string): Promise<void>;
}
