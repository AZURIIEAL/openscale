import type { CreateProjectInput, Project } from './entities';

/** Port for the projects API; http and mock adapters implement it. */
export interface ProjectsGateway {
  list(): Promise<Project[]>;
  create(input: CreateProjectInput): Promise<Project>;
  update(slug: string, patch: { name?: string; description?: string }): Promise<Project>;
  archive(slug: string): Promise<void>;
  /** A project file (control-plane/internal/bundle); the server validates it. */
  importProject(bundle: unknown): Promise<Project>;
}
