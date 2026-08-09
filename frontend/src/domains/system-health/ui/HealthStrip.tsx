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

  if (isLoading || !data) {
    return <div className="mb-5 h-[74px]" />;
  }

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {sortServicesForDisplay(data.services).map((service) => (
        <ServiceHealthCard key={service.id} service={service} />
      ))}
    </div>
  );
}
