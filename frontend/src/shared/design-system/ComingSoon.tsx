import { Panel } from './Panel';

interface ComingSoonProps {
  screenName: string;
  description: string;
}

/** Placeholder for domains not built yet. Deliberately visible as a
 * placeholder rather than faking content -- consistent with this project's
 * "don't claim something works before it does" stance (see
 * ideas/vision-and-roadmap.md's honest-scope note). */
export function ComingSoon({ screenName, description }: ComingSoonProps) {
  return (
    <Panel className="flex flex-col items-start gap-2 p-6">
      <span className="os-font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--text-subtle)' }}>
        Not built yet
      </span>
      <h2 className="os-font-display m-0 text-lg uppercase" style={{ color: 'var(--text-heading)' }}>
        {screenName}
      </h2>
      <p className="m-0 max-w-md text-sm" style={{ color: 'var(--text-muted)' }}>
        {description}
      </p>
    </Panel>
  );
}
