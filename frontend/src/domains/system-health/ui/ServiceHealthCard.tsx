import { Panel } from '@/shared/design-system/Panel';
import { Led } from '@/shared/design-system/Led';
import { ServiceConsoleAffordance } from './ServiceConsoleAffordance';
import type { ServiceHealth } from '../domain/entities';

export function ServiceHealthCard({ service }: { service: ServiceHealth }) {
  const isLinkable = Boolean(service.consoleUrl) && service.status !== 'crit';

  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          {service.name}
          <ServiceConsoleAffordance service={service} />
        </span>
        <Led status={service.status} label={`${service.name}: ${service.status}`} />
      </div>
      <span className="os-font-mono os-tabular-nums text-[10.5px]" style={{ color: 'var(--ink-muted)' }}>
        {service.detail}
      </span>
    </>
  );

  if (isLinkable) {
    return (
      <a
        href={service.consoleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="os-panel-sm group flex flex-col gap-2 p-3.5 transition-transform hover:-translate-y-0.5 active:translate-y-0"
        title={`Open ${service.name} console`}
      >
        {body}
      </a>
    );
  }

  return (
    <Panel size="sm" className="flex flex-col gap-2 p-3.5">
      {body}
    </Panel>
  );
}
