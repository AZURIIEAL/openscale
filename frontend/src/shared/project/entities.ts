/** Mirrors control-plane/internal/projects.Project's JSON shape. */
export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** Feature flags, e.g. { legacy_taxi: true } on the sample project. */
  features: Record<string, boolean>;
  aiSettings: Record<string, unknown>;
  createdAt: string;
  archivedAt?: string;
}

export interface CreateProjectInput {
  name: string;
  /** Optional; the control-plane derives one from the name when omitted. */
  slug?: string;
  description?: string;
}

/** The one project whose Pipelines/Dashboards/Streaming screens still show
 * the hardcoded taxi stages. Mirrors projects.FeatureLegacyTaxi in Go. */
export const FEATURE_LEGACY_TAXI = 'legacy_taxi';
