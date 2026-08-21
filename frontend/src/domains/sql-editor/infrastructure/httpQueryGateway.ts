import { apiGet, apiPost } from '@/shared/api/httpClient';
import type { QueryGateway } from '../application/QueryGateway';
import type { CatalogTable, QueryError, QueryResult } from '../domain/entities';

export const httpQueryGateway: QueryGateway = {
  async runQuery(sql) {
    // Deliberately not apiPost<QueryResult>: the control-plane always
    // responds 200 here, with the outcome (success or {"error": "..."})
    // distinguished in the body, not the status code -- see
    // control-plane/internal/api/query_handler.go's Run.
    return apiPost<QueryResult | QueryError>('/api/query', { sql });
  },
  async fetchCatalog() {
    return apiGet<CatalogTable[]>('/api/query/catalog');
  },
};
