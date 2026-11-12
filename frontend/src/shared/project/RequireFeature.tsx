import type { ReactNode } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { useCurrentProject } from './useCurrentProject';
import { hasFeature } from './rules';

interface RequireFeatureProps {
  feature: string;
  screenName: string;
  /** What the screen will do once it is generic -- shown instead of the
   * taxi-specific content in projects that don't carry the flag. */
  description: string;
  children: ReactNode;
}

/**
 * Temporary gate (Phase 1 of the implementation plan): screens whose
 * content is still hardcoded to the taxi pipeline render only in the
 * project flagged `legacy_taxi`; everywhere else they say so plainly
 * rather than showing another project's data. Removed in Phase 4, when
 * pipelines, dashboards and streaming become per-project rows.
 */
export function RequireFeature({ feature, screenName, description, children }: RequireFeatureProps) {
  const { project } = useCurrentProject();
  if (hasFeature(project, feature)) return <>{children}</>;

  return (
    <Panel className="flex flex-col items-start gap-2 p-6">
      <span className="os-font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--text-subtle)' }}>
        Not available in this project yet
      </span>
      <h2 className="m-0 text-lg" style={{ color: 'var(--text-heading)' }}>
        {screenName}
      </h2>
      <p className="m-0 max-w-md text-sm" style={{ color: 'var(--text-muted)' }}>
        {description}
      </p>
    </Panel>
  );
}
