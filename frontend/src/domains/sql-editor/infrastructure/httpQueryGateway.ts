import { apiGet, apiPost } from '@/shared/api/httpClient';
import { projectApiPath } from '@/shared/project/rules';
import type { QueryGateway, QueryTarget } from '../application/QueryGateway';
import type { CatalogTable, QueryError, QueryResult } from '../domain/entities';

function queryPath(t: QueryTarget, suffix = ''): string {
  return t.legacy ? `/api/query${suffix}` : projectApiPath(t.projectSlug, `query${suffix}`);
}

export const httpQueryGateway: QueryGateway = {
  async runQuery(target, sql) {
    // Deliberately not apiPost<QueryResult>: both backends always respond
    // 200 here, with the outcome (success or {"error": "..."}) in the
    // body, not the status code -- see query_handler.go and
    // project_query_handler.go's Run.
    return apiPost<QueryResult | QueryError>(queryPath(target), { sql });
  },
  async fetchCatalog(target) {
    return apiGet<CatalogTable[]>(queryPath(target, '/catalog'));
  },
};
