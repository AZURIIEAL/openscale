import { HealthStrip } from '@/domains/system-health/ui/HealthStrip';
import { useHomeOverview } from '../application/useHomeOverview';
import { GaugeRow } from './GaugeRow';
import { StatsRow } from './StatsRow';
import { RecentRunsTable } from './RecentRunsTable';

/**
 * Composition root for the Home screen: pulls system-health's read-model
 * (via HealthStrip) alongside Home's own overview data. Each domain owns
 * its own fetching/caching -- this component only arranges the results.
 */
export function HomeScreen() {
  const { data, isLoading } = useHomeOverview();

  return (
    <div>
      <HealthStrip />
      {isLoading || !data ? (
        <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Loading overview…
        </div>
      ) : (
        <>
          <GaugeRow gauges={data.gauges} revenueTrend={data.revenueTrend} />
          <StatsRow stats={data.stats} />
          <RecentRunsTable runs={data.recentRuns} />
        </>
      )}
    </div>
  );
}
