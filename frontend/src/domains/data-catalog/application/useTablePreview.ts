import { useMutation } from '@tanstack/react-query';
import { httpQueryGateway } from '@/domains/sql-editor/infrastructure/httpQueryGateway';
import { isQueryError } from '@/domains/sql-editor/domain/rules';
import type { QueryResult } from '@/domains/sql-editor/domain/entities';
import { quotedTableRef } from '../domain/rules';

export interface TablePreviewResult {
  rowCount: number | null;
  rowCountError: string | null;
  sample: QueryResult | null;
  sampleError: string | null;
}

/** Reuses the SQL Editor's query-running gateway directly (POST
 * /api/query) rather than a new backend endpoint -- see
 * infrastructure/httpQueryGateway.ts. */
const gateway = httpQueryGateway;

/** Fires the two on-demand queries a Data Catalog table row needs when a
 * user expands/previews it -- COUNT(*) and a 20-row sample -- through the
 * exact same read-only mechanism the SQL Editor uses. Both identifiers are
 * double-quoted (quotedTableRef): some of this repo's real table/column
 * names are mixed-case (e.g. zone_hour_features' "PULocationID"), so
 * quoting matters for correctness, not just style. Deliberately a
 * mutation, not a query -- this must run only when a user explicitly
 * expands a table, never eagerly for every table on page load. */
export function useTablePreview() {
  return useMutation({
    mutationFn: async ({ schema, table }: { schema: string; table: string }): Promise<TablePreviewResult> => {
      const ref = quotedTableRef(schema, table);
      const [countResult, sampleResult] = await Promise.all([
        gateway.runQuery(`SELECT COUNT(*) FROM ${ref}`),
        gateway.runQuery(`SELECT * FROM ${ref} LIMIT 20`),
      ]);

      return {
        rowCount: isQueryError(countResult) ? null : Number(countResult.rows[0]?.[0] ?? 0),
        rowCountError: isQueryError(countResult) ? countResult.error : null,
        sample: isQueryError(sampleResult) ? null : (sampleResult as QueryResult),
        sampleError: isQueryError(sampleResult) ? sampleResult.error : null,
      };
    },
  });
}
