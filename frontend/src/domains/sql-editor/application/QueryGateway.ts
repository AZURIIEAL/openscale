import type { CatalogTable, QueryError, QueryResult } from '../domain/entities';

/**
 * Port: the SQL Editor's two reads -- run a query, and fetch the schema
 * browser's catalog. infrastructure/ provides mock and http implementations.
 */
export interface QueryGateway {
  runQuery(sql: string): Promise<QueryResult | QueryError>;
  fetchCatalog(): Promise<CatalogTable[]>;
}
