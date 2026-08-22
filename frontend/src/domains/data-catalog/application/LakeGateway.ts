import type { LakeCatalog } from '../domain/entities';

/**
 * Port: the Data Catalog's one new read -- the MinIO lake's object
 * inventory. infrastructure/ provides mock and http implementations,
 * mirroring sql-editor/application/QueryGateway.ts and
 * streaming/application/StreamingGateway.ts.
 */
export interface LakeGateway {
  fetchLakeCatalog(): Promise<LakeCatalog>;
}
