import { apiDelete, apiGet, apiPut } from '@/shared/api/httpClient';
import { projectApiPath } from '@/shared/project/rules';
import type { SavedQueriesGateway } from '../application/SavedQueriesGateway';
import type { SavedQuery } from '../domain/entities';

const path = (slug: string, name = '') => projectApiPath(slug, `saved-queries${name ? `/${encodeURIComponent(name)}` : ''}`);

export const httpSavedQueriesGateway: SavedQueriesGateway = {
  list: (slug) => apiGet<SavedQuery[]>(path(slug)),
  save: (slug, name, sql, chart) => apiPut<SavedQuery>(path(slug, name), { sql, chart }),
  remove: (slug, name) => apiDelete(path(slug, name)),
};
