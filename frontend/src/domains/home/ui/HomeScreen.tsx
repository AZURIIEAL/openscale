import { HealthStrip } from '@/domains/system-health/ui/HealthStrip';
import { useHomeOverview } from '../application/useHomeOverview';
import { useContainerStats } from '../application/useContainerStats';
import { toLiveGauges } from '../domain/rules';
import { GaugeRow } from './GaugeRow';
import { StatsRow } from './StatsRow';
import { RecentRunsTable } from './RecentRunsTable';
import { ContainerImageTable } from './ContainerImageTable';

/**
 * Composition root for the Home screen: pulls system-health's read-model
 * (via HealthStrip) alongside Home's own overview data. Each domain owns
 * its own fetching/caching -- this component only arranges the results.
 */
export function HomeScreen() {
  const { data, isLoading } = useHomeOverview();
  // Polled separately (4s vs. the 15s overview) so the resource gauges and
  // per-image table actually read as real-time, without refetching the
  // whole overview (revenue trend, stats, recent runs) that often.
  const { data: liveStats } = useContainerStats();

  return (
    <div>
      <HealthStrip />
      {isLoading || !data ? (
        <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Loading overview…
        </div>
      ) : (
        <>
          <GaugeRow gauges={liveStats ? toLiveGauges(liveStats.totals) : data.gauges} revenueTrend={data.revenueTrend} />
          <StatsRow stats={data.stats} />
          {liveStats ? <div className="mb-4"><ContainerImageTable containers={liveStats.containers} /></div> : null}
          <RecentRunsTable runs={data.recentRuns} />
        </>
      )}
    </div>
  );
}
