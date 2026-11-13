import { FEATURE_LEGACY_TAXI } from '@/shared/project/entities';
import { hasFeature } from '@/shared/project/rules';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { DatasetsPanel } from '@/domains/datasets/ui/DatasetsPanel';
import { PostgresTablesPanel } from './PostgresTablesPanel';
import { LakeBrowserPanel } from './LakeBrowserPanel';
import { PipelineLineage } from './PipelineLineage';

/**
 * Data Catalog. For every project: its datasets (upload, fetch, schema,
 * preview, profile). The taxi sample project additionally keeps its
 * original panels -- the Postgres Gold tables, the fixed Bronze/Silver/Gold
 * lake prefixes and the static five-stage lineage -- until those stages
 * become ordinary datasets and pipeline rows (Phase 4 of the plan).
 */
export function DataCatalogScreen() {
  const { project } = useCurrentProject();
  const legacy = hasFeature(project, FEATURE_LEGACY_TAXI);

  return (
    <div className="flex flex-col gap-5">
      {legacy && <PipelineLineage />}
      <DatasetsPanel />
      {legacy && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <PostgresTablesPanel />
          <LakeBrowserPanel />
        </div>
      )}
    </div>
  );
}
