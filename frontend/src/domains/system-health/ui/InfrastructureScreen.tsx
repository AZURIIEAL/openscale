import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import { Led } from '@/shared/design-system/Led';
import { useSystemHealthSummary } from '../application/useSystemHealthSummary';

/**
 * Real data (via useSystemHealthSummary), no action buttons yet -- restart/
 * stop needs the control-plane's Docker Engine API wiring (see
 * ideas/tech-stack.md), which doesn't exist yet. Showing real status
 * without fake controls is more honest than either an empty placeholder or
 * buttons that silently do nothing.
 */
export function InfrastructureScreen() {
  const { data, isLoading } = useSystemHealthSummary();

  return (
    <div>
      <div className="os-font-mono mb-2.5 ml-0.5 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-muted)' }}>
        Services
      </div>
      <Panel className="flex flex-col gap-1.5 p-2">
        {isLoading && (
          <Well className="p-4 text-sm" style={{ color: 'var(--ink-muted)' }}>
            Loading service health…
          </Well>
        )}
        {data?.services.map((service) => (
          <Well key={service.id} className="flex items-center gap-3.5 px-4 py-3">
            <Led status={service.status} label={`${service.name}: ${service.status}`} />
            <span className="min-w-[130px] text-[13px] font-semibold">{service.name}</span>
            <span className="os-font-mono flex-1 text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
              {service.detail}
            </span>
          </Well>
        ))}
      </Panel>
    </div>
  );
}
