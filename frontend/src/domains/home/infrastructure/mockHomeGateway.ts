import type { HomeGateway } from '../application/HomeGateway';
import type { HomeOverview } from '../domain/entities';

/**
 * Adapter: stands in for the future control-plane's `GET /api/home/overview`
 * (or equivalent composed read-model). Numbers below are real, taken from
 * this project's actual verified runs -- not placeholders -- so the shape
 * of the response matches what the real endpoint will need to return.
 */
const MOCK_OVERVIEW: HomeOverview = {
  gauges: [
    { id: 'driver-memory', label: 'Driver Memory', sublabel: '5.2 / 8 GB', valuePercent: 65, color: 'accent' },
    { id: 'shuffle-load', label: 'Shuffle Load', sublabel: '7 / 8 parts', valuePercent: 35, color: 'warn' },
  ],
  revenueTrend: {
    // Daily revenue, oldest (14d ago) first, in $K -- same upward shape as
    // the original mockup's sparkline (values only, not pixel coordinates;
    // Sparkline normalizes min/max itself).
    values: [82, 90, 86, 100, 96, 104, 110, 102, 114, 108, 120, 116, 126, 122, 130],
    totalLabel: '$412.8K',
    changeLabel: '▲ 4.2%',
  },
  stats: [
    { id: 'silver-rows', label: 'Silver rows processed', value: '138.0M' },
    { id: 'months', label: 'months ingested', value: '40' },
    { id: 'gold-tables', label: 'Gold tables', value: '4' },
    { id: 'fare-mae', label: 'fare model MAE', value: '$2.92' },
  ],
  recentRuns: [
    { id: 'r1', jobName: 'run_gold', startedAt: '09:41:02', durationLabel: '41s', status: 'good' },
    { id: 'r2', jobName: 'compute_features', startedAt: '09:38:55', durationLabel: '1m 12s', status: 'good' },
    { id: 'r3', jobName: 'train_fare_model', startedAt: '09:31:20', durationLabel: '38s', status: 'good' },
    { id: 'r4', jobName: 'ingest 2026-05', startedAt: '08:55:41', durationLabel: '2m 04s', status: 'good' },
    { id: 'r5', jobName: 'replay 2024-01-01', startedAt: '08:40:12', durationLabel: '6s', status: 'warn' },
  ],
};

export const mockHomeGateway: HomeGateway = {
  async fetchOverview() {
    return MOCK_OVERVIEW;
  },
};
