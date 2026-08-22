// CatalogTable/CatalogColumn deliberately aren't redefined here -- the
// Postgres side of this catalog is the SQL Editor's existing schema browser
// reused as-is (see application/../sql-editor's useCatalog), so importing
// its types keeps one definition instead of two that could drift.
export type { CatalogTable, CatalogColumn } from '@/domains/sql-editor/domain/entities';

/** One real object in the openscale-lake bucket -- see
 * control-plane/internal/lake.Object. Only what MinIO's own listing
 * actually provides: no row counts (Parquet's real row count would need
 * reading the file, not just listing it -- this app doesn't do that
 * anywhere, see LakeLayer's doc comment). */
export interface LakeObject {
  key: string;
  sizeBytes: number;
  lastModified: string;
}

/** One known prefix in the lake -- bronze, silver, silver-quarantine, or
 * one of the four Gold sub-layers. See
 * control-plane/internal/api/lake_handler.go's lakePrefixes for the
 * authoritative list of the seven real prefixes the worker's Spark jobs
 * write to. */
export interface LakeLayer {
  name: string;
  prefix: string;
  objects: LakeObject[];
  objectCount: number;
  totalBytes: number;
}

/** GET /api/catalog/lake's full response -- reachable mirrors the
 * Streaming screen's brokerReachable convention: a MinIO connectivity
 * failure comes back as reachable:false with empty layers, not an HTTP
 * error (see control-plane/internal/api/lake_handler.go's List). */
export interface LakeCatalog {
  layers: LakeLayer[];
  reachable: boolean;
}

// The static pipeline lineage diagram (Part 3) deliberately has no entity
// of its own here -- it reuses pipelines/domain/entities.ts's JOB_CATALOG
// directly (ui/PipelineLineage.tsx), the same real, hardcoded Bronze ->
// Silver -> Gold -> Features -> Train order and descriptions the Pipelines
// screen already shows, rather than a second copy that could drift.
