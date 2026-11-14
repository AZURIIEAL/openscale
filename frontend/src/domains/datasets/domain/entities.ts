/** Mirrors control-plane/internal/datasets.Dataset's JSON shape. */
export type DatasetStatus = 'pending' | 'ready' | 'failed';
export type DatasetLayer = 'bronze' | 'silver' | 'gold';

export interface DatasetSource {
  kind: 'upload' | 'url';
  url?: string;
  filename?: string;
}

export interface DatasetColumn {
  name: string;
  type: string;
}

export interface ProfileColumn {
  name: string;
  type: string;
  nullCount: number;
  nullShare: number;
  distinct?: number | null;
  min?: unknown;
  max?: unknown;
  mean?: number | null;
}

export interface DatasetProfile {
  rowCount: number;
  columns: ProfileColumn[];
  error?: string;
}

export interface Dataset {
  id: string;
  projectId: string;
  name: string;
  layer: DatasetLayer;
  status: DatasetStatus;
  source: DatasetSource;
  columns: DatasetColumn[];
  rowCount?: number;
  sizeBytes?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFromUrlInput {
  name?: string;
  layer?: DatasetLayer;
  url: string;
}

export interface UploadInput {
  file: File;
  name?: string;
  layer?: DatasetLayer;
  /** 0..1 */
  onProgress?: (fraction: number) => void;
}
