import { Panel } from '@/shared/design-system/Panel';
import { Led } from '@/shared/design-system/Led';
import type { ServiceHealth } from '../domain/entities';

export function ServiceHealthCard({ service }: { service: ServiceHealth }) {
  return (
    <Panel size="sm" className="flex flex-col gap-2 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{service.name}</span>
        <Led status={service.status} label={`${service.name}: ${service.status}`} />
      </div>
      <span className="os-font-mono os-tabular-nums text-[10.5px]" style={{ color: 'var(--ink-muted)' }}>
        {service.detail}
      </span>
    </Panel>
  );
}
