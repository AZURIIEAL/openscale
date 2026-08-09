import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import { Led } from '@/shared/design-system/Led';
import { ServiceConsoleAffordance } from './ServiceConsoleAffordance';
import { ServiceControlButtons } from './ServiceControlButtons';
import { useSystemHealthSummary } from '../application/useSystemHealthSummary';
import { sortServicesForDisplay } from '../domain/rules';

/**
 * Real data (via useSystemHealthSummary) with real controls (via
 * useServiceControl, inside ServiceControlButtons) -- both talk to the
 * control-plane's Docker Engine API wiring.
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
        {data && sortServicesForDisplay(data.services).map((service) => {
          const isLinkable = Boolean(service.consoleUrl) && service.status !== 'crit';

          const identity = (
            <>
              <Led status={service.status} label={`${service.name}: ${service.status}`} />
              <span className="flex min-w-[130px] items-center gap-1.5 text-[13px] font-semibold">
                {service.name}
                <ServiceConsoleAffordance service={service} />
              </span>
              <span className="os-font-mono flex-1 text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                {service.detail}
              </span>
            </>
          );

          return (
            <Well key={service.id} className="flex items-center gap-3.5 px-4 py-3">
              {isLinkable ? (
                <a
                  href={service.consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-w-0 flex-1 items-center gap-3.5 no-underline transition-transform hover:-translate-y-0.5 active:translate-y-0"
                  title={`Open ${service.name} console`}
                >
                  {identity}
                </a>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3.5">{identity}</div>
              )}
              <ServiceControlButtons service={service} />
            </Well>
          );
        })}
      </Panel>
    </div>
  );
}
