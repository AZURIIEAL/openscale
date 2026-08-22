import { apiGet } from '@/shared/api/httpClient';
import type { LakeGateway } from '../application/LakeGateway';
import type { LakeCatalog } from '../domain/entities';

export const httpLakeGateway: LakeGateway = {
  async fetchLakeCatalog() {
    return apiGet<LakeCatalog>('/api/catalog/lake');
  },
};
