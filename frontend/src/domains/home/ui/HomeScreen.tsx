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

  if (isLoading || !data) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Loading overview…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <StatsRow stats={data.stats} />
      <GaugeRow gauges={liveStats ? toLiveGauges(liveStats.totals) : data.gauges} revenueTrend={data.revenueTrend} />
      <HealthStrip />
      {liveStats ? <ContainerImageTable containers={liveStats.containers} /> : null}
      <RecentRunsTable runs={data.recentRuns} />
    </div>
  );
}
