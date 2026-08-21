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
  const allHealthy = data?.services.every((s) => s.status === 'good') ?? false;

  return (
    <Panel>
      <header>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>Services</h3>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
          {data ? `${data.services.length} containers, ${allHealthy ? 'all healthy' : 'check status below'}` : 'Loading…'}
        </p>
      </header>
      <div className="mt-4 flex flex-col gap-2.5">
        {isLoading && (
          <Well className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            Loading service health…
          </Well>
        )}
        {data &&
          sortServicesForDisplay(data.services).map((service) => {
            const isLinkable = Boolean(service.consoleUrl) && service.status !== 'crit';

            const identity = (
              <>
                <Led status={service.status} label={`${service.name}: ${service.status}`} />
                <span className="flex min-w-[130px] items-center gap-1.5 text-[15px] font-semibold" style={{ letterSpacing: '-0.01em' }}>
                  {service.name}
                  <ServiceConsoleAffordance service={service} />
                </span>
                <span className="os-font-mono flex-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  {service.detail}
                </span>
              </>
            );

            return (
              <Well key={service.id} className="flex items-center gap-3.5 px-5 py-4">
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
      </div>
    </Panel>
  );
}
