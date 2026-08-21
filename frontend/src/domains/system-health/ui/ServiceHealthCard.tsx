import { Led } from '@/shared/design-system/Led';
import { ServiceConsoleAffordance } from './ServiceConsoleAffordance';
import type { ServiceHealth } from '../domain/entities';

/** One row in Home's "Services" card -- status dot + name on the left,
 * response-time detail on the right, in a responsive grid of rows (not the
 * old small-card grid). Opens the service's real console in a new tab when
 * one exists and the service is healthy enough to reach. */
export function ServiceHealthCard({ service }: { service: ServiceHealth }) {
  const isLinkable = Boolean(service.consoleUrl) && service.status !== 'crit';

  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        <Led status={service.status} label={`${service.name}: ${service.status}`} />
        <span className="flex items-center gap-1.5 truncate text-[14px] font-semibold">
          {service.name}
          <ServiceConsoleAffordance service={service} />
        </span>
      </span>
      <span className="os-font-mono os-tabular-nums whitespace-nowrap text-[12px]" style={{ color: 'var(--text-subtle)' }}>
        {service.detail}
      </span>
    </>
  );

  const rowClass =
    'flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 transition-transform hover:-translate-y-0.5 active:translate-y-0';
  const rowStyle = { background: 'var(--surface-sunken)' } as const;

  if (isLinkable) {
    return (
      <a href={service.consoleUrl} target="_blank" rel="noopener noreferrer" className={`group ${rowClass}`} style={rowStyle} title={`Open ${service.name} console`}>
        {body}
      </a>
    );
  }

  return (
    <div className={rowClass} style={rowStyle}>
      {body}
    </div>
  );
}
