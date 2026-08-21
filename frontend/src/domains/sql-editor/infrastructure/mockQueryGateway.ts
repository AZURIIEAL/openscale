import type { QueryGateway } from '../application/QueryGateway';
import type { CatalogTable, QueryError, QueryResult } from '../domain/entities';

/**
 * Adapter: stands in for the control-plane's /api/query + /api/query/catalog
 * when it's unreachable, mirroring pipelines/infrastructure/mockJobsGateway's
 * convention. Not wired up by default -- application/useRunQuery.ts and
 * useCatalog.ts point at httpQueryGateway instead.
 */
const MOCK_CATALOG: CatalogTable[] = [
  {
    schema: 'control_plane',
    table: 'job_runs',
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'job_type', type: 'text' },
      { name: 'status', type: 'text' },
      { name: 'submitted_at', type: 'timestamp with time zone' },
      { name: 'rows_processed', type: 'bigint' },
    ],
  },
  {
    schema: 'public',
    table: 'gold_daily_revenue',
    columns: [
      { name: 'pickup_date', type: 'date' },
      { name: 'trip_count', type: 'bigint' },
      { name: 'total_revenue', type: 'double precision' },
      { name: 'avg_fare', type: 'double precision' },
    ],
  },
];

const MOCK_RESULT: QueryResult = {
  columns: ['job_type', 'status', 'rows_processed'],
  rows: [
    ['ingest', 'succeeded', 1_245_000],
    ['silver', 'succeeded', 1_198_532],
    ['gold', 'succeeded', null],
  ],
  rowCount: 3,
  durationMs: 4,
  truncated: false,
};

export const mockQueryGateway: QueryGateway = {
  async runQuery(sql) {
    if (!/^\s*(--.*\n|\s)*(select|with)\b/i.test(sql)) {
      return { error: 'Only SELECT queries are allowed.' } satisfies QueryError;
    }
    return MOCK_RESULT;
  },
  async fetchCatalog() {
    return MOCK_CATALOG;
  },
};
