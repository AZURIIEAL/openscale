import { Panel } from '@/shared/design-system/Panel';
import { ServiceHealthCard } from './ServiceHealthCard';
import { useSystemHealthSummary } from '../application/useSystemHealthSummary';
import { sortServicesForDisplay } from '../domain/rules';

/**
 * Reusable across domains -- Home renders this to open with "is everything
 * up," without needing to know anything about how service health is
 * fetched or modeled. That knowledge stays inside system-health.
 */
export function HealthStrip() {
  const { data, isLoading } = useSystemHealthSummary();

  return (
    <Panel>
      <header>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>Services</h3>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>Endpoint and response time</p>
      </header>
      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {isLoading || !data ? (
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Loading service health…
          </div>
        ) : (
          sortServicesForDisplay(data.services).map((service) => <ServiceHealthCard key={service.id} service={service} />)
        )}
      </div>
    </Panel>
  );
}
