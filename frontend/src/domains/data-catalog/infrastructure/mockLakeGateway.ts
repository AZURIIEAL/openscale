import type { LakeGateway } from '../application/LakeGateway';
import type { LakeCatalog } from '../domain/entities';

/**
 * Adapter: stands in for the control-plane's /api/catalog/lake when it's
 * unreachable, mirroring sql-editor/infrastructure/mockQueryGateway's
 * convention. Not wired up by default -- application/useLakeCatalog.ts
 * points at httpLakeGateway instead.
 */
const MOCK_LAKE_CATALOG: LakeCatalog = {
  reachable: true,
  layers: [
    {
      name: 'bronze',
      prefix: 'bronze/yellow_taxi/',
      objectCount: 2,
      totalBytes: 58_200_000,
      objects: [
        { key: 'bronze/yellow_taxi/2024-01.parquet', sizeBytes: 29_100_000, lastModified: '2024-02-01T03:12:00Z' },
        { key: 'bronze/yellow_taxi/2024-02.parquet', sizeBytes: 29_100_000, lastModified: '2024-03-01T03:12:00Z' },
      ],
    },
    {
      name: 'silver',
      prefix: 'silver/trips/',
      objectCount: 2,
      totalBytes: 24_500_000,
      objects: [
        { key: 'silver/trips/silver_trips_2024_01.parquet', sizeBytes: 12_250_000, lastModified: '2024-02-01T04:05:00Z' },
        { key: 'silver/trips/silver_trips_2024_02.parquet', sizeBytes: 12_250_000, lastModified: '2024-03-01T04:05:00Z' },
      ],
    },
    {
      name: 'silver-quarantine',
      prefix: 'silver/quarantine/',
      objectCount: 1,
      totalBytes: 18_400,
      objects: [{ key: 'silver/quarantine/negative_fares_2024_01.parquet', sizeBytes: 18_400, lastModified: '2024-02-01T04:05:00Z' }],
    },
    {
      name: 'gold-daily-revenue',
      prefix: 'gold/daily_revenue/',
      objectCount: 1,
      totalBytes: 41_200,
      objects: [{ key: 'gold/daily_revenue/part-00000-abc123.snappy.parquet', sizeBytes: 41_200, lastModified: '2024-03-01T05:10:00Z' }],
    },
    {
      name: 'gold-hourly-demand',
      prefix: 'gold/hourly_demand/',
      objectCount: 1,
      totalBytes: 33_700,
      objects: [{ key: 'gold/hourly_demand/part-00000-def456.snappy.parquet', sizeBytes: 33_700, lastModified: '2024-03-01T05:11:00Z' }],
    },
    {
      name: 'gold-zone-stats',
      prefix: 'gold/zone_stats/',
      objectCount: 1,
      totalBytes: 27_900,
      objects: [{ key: 'gold/zone_stats/part-00000-ghi789.snappy.parquet', sizeBytes: 27_900, lastModified: '2024-03-01T05:12:00Z' }],
    },
    {
      name: 'gold-congestion-metrics',
      prefix: 'gold/congestion_metrics/',
      objectCount: 1,
      totalBytes: 22_100,
      objects: [{ key: 'gold/congestion_metrics/part-00000-jkl012.snappy.parquet', sizeBytes: 22_100, lastModified: '2024-03-01T05:13:00Z' }],
    },
  ],
};

export const mockLakeGateway: LakeGateway = {
  async fetchLakeCatalog() {
    return MOCK_LAKE_CATALOG;
  },
};
