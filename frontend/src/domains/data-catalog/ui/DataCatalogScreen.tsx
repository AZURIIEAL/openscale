import { PostgresTablesPanel } from './PostgresTablesPanel';
import { LakeBrowserPanel } from './LakeBrowserPanel';
import { PipelineLineage } from './PipelineLineage';

/**
 * Real Data Catalog, covering both places this app's data actually lives:
 * Postgres (Gold aggregates, the feature table, job history -- reusing the
 * SQL Editor's existing schema catalog and query-running mechanism) and the
 * MinIO lake (raw Bronze/Silver/Gold Parquet -- a new, real object listing
 * off the control-plane's new /api/catalog/lake). PipelineLineage is a
 * static, honest flow diagram of the five real pipeline stages, not a
 * computed/discovered graph -- see its own doc comment.
 */
export function DataCatalogScreen() {
  return (
    <div className="flex flex-col gap-5">
      <PipelineLineage />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <PostgresTablesPanel />
        <LakeBrowserPanel />
      </div>
    </div>
  );
}
