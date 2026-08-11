export interface DailyRevenuePoint {
  /** ISO date, e.g. "2024-07-14". */
  date: string;
  tripCount: number;
  totalRevenue?: number;
  totalFare?: number;
  totalTips?: number;
  avgFare?: number;
}

export interface HourlyDemandPoint {
  /** 0-23. */
  hour: number;
  tripCount: number;
  avgFare?: number;
  avgTripDistance?: number;
  avgPassengerCount?: number;
}

export interface ZoneStat {
  /** Raw NYC TLC PULocationID -- no zone-name lookup table exists in this
   * repo, so zones render as "Zone {id}" rather than a real name. */
  zoneId: number;
  tripCount: number;
  totalRevenue?: number;
  avgFare?: number;
  avgTripDistance?: number;
  avgTip?: number;
}

export interface CongestionPoint {
  date: string;
  tripCount: number;
  tripsWithCongestion: number;
  totalCongestionSurcharge?: number;
  congestionTripPct?: number;
}

export interface ModelMetricPoint {
  finishedAt: string;
  mae?: number;
  rmse?: number;
  r2?: number;
}

export interface JobTypeHealth {
  jobType: string;
  succeeded: number;
  partial: number;
  failed: number;
  avgDurationSeconds?: number;
}

export interface DashboardsOverview {
  dailyRevenue: DailyRevenuePoint[];
  hourlyDemand: HourlyDemandPoint[];
  topZones: ZoneStat[];
  congestion: CongestionPoint[];
  modelMetrics: ModelMetricPoint[];
  etlHealth: JobTypeHealth[];
}
