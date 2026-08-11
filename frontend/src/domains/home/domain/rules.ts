import type { GaugeColor, ResourceGauge, ResourceTotals } from './entities';

/** 1 GiB in bytes -- byte counts from the control-plane are always binary
 * (Docker/cgroup convention), so formatting uses 1024-based units. */
const GIB = 1024 ** 3;

export function formatGiB(bytes: number): string {
  return (bytes / GIB).toFixed(1);
}

/** Same accent/warn/crit thresholds used across the dashboard: comfortable
 * under 60%, worth watching from 60-85%, critical above that. */
function colorForPercent(percent: number): GaugeColor {
  if (percent >= 85) return 'crit';
  if (percent >= 60) return 'warn';
  return 'accent';
}

/**
 * Turns the live Docker stats snapshot's host-wide totals into the two
 * gauges the Home screen renders in place of the old driver-memory/
 * shuffle-load mocks -- real RAM and CPU utilization across every running
 * container on the host.
 */
export function toLiveGauges(totals: ResourceTotals): ResourceGauge[] {
  return [
    {
      id: 'container-memory',
      label: 'Container Memory',
      sublabel: `${formatGiB(totals.memUsedBytes)} / ${formatGiB(totals.memTotalBytes)} GB`,
      valuePercent: totals.memPercent,
      color: colorForPercent(totals.memPercent),
    },
    {
      id: 'container-cpu',
      label: 'Container CPU',
      sublabel: totals.numCpu > 0 ? `${((totals.cpuPercent / 100) * totals.numCpu).toFixed(1)} / ${totals.numCpu} cores` : '—',
      valuePercent: totals.cpuPercent,
      color: colorForPercent(totals.cpuPercent),
    },
  ];
}
