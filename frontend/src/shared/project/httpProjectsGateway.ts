import { apiDelete, apiGet, apiPatch, apiPost } from '@/shared/api/httpClient';
import type { ProjectsGateway } from './ProjectsGateway';
import type { Project } from './entities';

export const httpProjectsGateway: ProjectsGateway = {
  list: () => apiGet<Project[]>('/api/projects'),
  create: (input) => apiPost<Project>('/api/projects', input),
  update: (slug, patch) => apiPatch<Project>(`/api/projects/${encodeURIComponent(slug)}`, patch),
  archive: (slug) => apiDelete(`/api/projects/${encodeURIComponent(slug)}`),
};
