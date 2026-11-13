import type { CatalogTable, QueryError, QueryResult } from '../domain/entities';

/** Where a query runs. The taxi sample project still queries Postgres
 * (its Gold tables live there); every other project queries its own
 * datasets through the DuckDB query engine. */
export interface QueryTarget {
  projectSlug: string;
  /** true -> legacy /api/query (Postgres); false -> /api/projects/{p}/query */
  legacy: boolean;
}

/**
 * Port: the SQL Editor's two reads -- run a query, and fetch the schema
 * browser's catalog. infrastructure/ provides mock and http implementations.
 */
export interface QueryGateway {
  runQuery(target: QueryTarget, sql: string): Promise<QueryResult | QueryError>;
  fetchCatalog(target: QueryTarget): Promise<CatalogTable[]>;
}
