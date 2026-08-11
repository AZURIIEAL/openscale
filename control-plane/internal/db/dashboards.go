package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// The gold_* tables are written directly by the worker (see
// worker/spark/gold/*.py's write_postgres) into the default `public`
// schema -- not part of control_plane's own migrated schema, same
// treatment zone_hour_features already gets from compute_features.py.
// They may not exist yet on a fresh deploy (before Gold has ever run
// successfully with this code), so every query here tolerates a missing
// table by returning an empty result instead of a 500.

func isUndefinedTable(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "42P01"
}

type DailyRevenuePoint struct {
	Date         string   `json:"date"`
	TripCount    int64    `json:"tripCount"`
	TotalRevenue *float64 `json:"totalRevenue"`
	TotalFare    *float64 `json:"totalFare"`
	TotalTips    *float64 `json:"totalTips"`
	AvgFare      *float64 `json:"avgFare"`
}

func (d *DB) ListGoldDailyRevenue(ctx context.Context) ([]DailyRevenuePoint, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT pickup_date::text, trip_count, total_revenue, total_fare, total_tips, avg_fare
		 FROM gold_daily_revenue ORDER BY pickup_date`,
	)
	if err != nil {
		if isUndefinedTable(err) {
			return []DailyRevenuePoint{}, nil
		}
		return nil, fmt.Errorf("db: list gold daily revenue: %w", err)
	}
	defer rows.Close()

	points := []DailyRevenuePoint{}
	for rows.Next() {
		var p DailyRevenuePoint
		if err := rows.Scan(&p.Date, &p.TripCount, &p.TotalRevenue, &p.TotalFare, &p.TotalTips, &p.AvgFare); err != nil {
			return nil, fmt.Errorf("db: scan gold daily revenue: %w", err)
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

type HourlyDemandPoint struct {
	Hour              int      `json:"hour"`
	TripCount         int64    `json:"tripCount"`
	AvgFare           *float64 `json:"avgFare"`
	AvgTripDistance   *float64 `json:"avgTripDistance"`
	AvgPassengerCount *float64 `json:"avgPassengerCount"`
}

func (d *DB) ListGoldHourlyDemand(ctx context.Context) ([]HourlyDemandPoint, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT pickup_hour, trip_count, avg_fare, avg_trip_distance, avg_passenger_count
		 FROM gold_hourly_demand ORDER BY pickup_hour`,
	)
	if err != nil {
		if isUndefinedTable(err) {
			return []HourlyDemandPoint{}, nil
		}
		return nil, fmt.Errorf("db: list gold hourly demand: %w", err)
	}
	defer rows.Close()

	points := []HourlyDemandPoint{}
	for rows.Next() {
		var p HourlyDemandPoint
		if err := rows.Scan(&p.Hour, &p.TripCount, &p.AvgFare, &p.AvgTripDistance, &p.AvgPassengerCount); err != nil {
			return nil, fmt.Errorf("db: scan gold hourly demand: %w", err)
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

type ZoneStat struct {
	ZoneID          int      `json:"zoneId"`
	TripCount       int64    `json:"tripCount"`
	TotalRevenue    *float64 `json:"totalRevenue"`
	AvgFare         *float64 `json:"avgFare"`
	AvgTripDistance *float64 `json:"avgTripDistance"`
	AvgTip          *float64 `json:"avgTip"`
}

func (d *DB) ListGoldTopZones(ctx context.Context, limit int) ([]ZoneStat, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT pu_location_id, trip_count, total_revenue, avg_fare, avg_trip_distance, avg_tip
		 FROM gold_zone_stats ORDER BY trip_count DESC LIMIT $1`,
		limit,
	)
	if err != nil {
		if isUndefinedTable(err) {
			return []ZoneStat{}, nil
		}
		return nil, fmt.Errorf("db: list gold top zones: %w", err)
	}
	defer rows.Close()

	zones := []ZoneStat{}
	for rows.Next() {
		var z ZoneStat
		if err := rows.Scan(&z.ZoneID, &z.TripCount, &z.TotalRevenue, &z.AvgFare, &z.AvgTripDistance, &z.AvgTip); err != nil {
			return nil, fmt.Errorf("db: scan gold top zones: %w", err)
		}
		zones = append(zones, z)
	}
	return zones, rows.Err()
}

type CongestionPoint struct {
	Date                     string   `json:"date"`
	TripCount                int64    `json:"tripCount"`
	TripsWithCongestion      int64    `json:"tripsWithCongestion"`
	TotalCongestionSurcharge *float64 `json:"totalCongestionSurcharge"`
	CongestionTripPct        *float64 `json:"congestionTripPct"`
}

func (d *DB) ListGoldCongestion(ctx context.Context) ([]CongestionPoint, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT pickup_date::text, trip_count, trips_with_congestion, total_congestion_surcharge, congestion_trip_pct
		 FROM gold_congestion_metrics ORDER BY pickup_date`,
	)
	if err != nil {
		if isUndefinedTable(err) {
			return []CongestionPoint{}, nil
		}
		return nil, fmt.Errorf("db: list gold congestion metrics: %w", err)
	}
	defer rows.Close()

	points := []CongestionPoint{}
	for rows.Next() {
		var p CongestionPoint
		if err := rows.Scan(&p.Date, &p.TripCount, &p.TripsWithCongestion, &p.TotalCongestionSurcharge, &p.CongestionTripPct); err != nil {
			return nil, fmt.Errorf("db: scan gold congestion metrics: %w", err)
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

type TrainMetricPoint struct {
	FinishedAt time.Time `json:"finishedAt"`
	Mae        *float64  `json:"mae"`
	Rmse       *float64  `json:"rmse"`
	R2         *float64  `json:"r2"`
}

// ListTrainMetrics returns every succeeded train run's logged mae/rmse/r2,
// chronological, for the "model quality over retrains" chart.
func (d *DB) ListTrainMetrics(ctx context.Context) ([]TrainMetricPoint, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT finished_at, metrics FROM control_plane.job_runs
		 WHERE job_type = 'train' AND status = 'succeeded' AND metrics IS NOT NULL
		 ORDER BY finished_at`,
	)
	if err != nil {
		return nil, fmt.Errorf("db: list train metrics: %w", err)
	}
	defer rows.Close()

	points := []TrainMetricPoint{}
	for rows.Next() {
		var finishedAt time.Time
		var raw []byte
		if err := rows.Scan(&finishedAt, &raw); err != nil {
			return nil, fmt.Errorf("db: scan train metrics: %w", err)
		}
		var parsed struct {
			Mae  *float64 `json:"mae"`
			Rmse *float64 `json:"rmse"`
			R2   *float64 `json:"r2"`
		}
		if err := json.Unmarshal(raw, &parsed); err != nil {
			return nil, fmt.Errorf("db: unmarshal train metrics: %w", err)
		}
		points = append(points, TrainMetricPoint{FinishedAt: finishedAt, Mae: parsed.Mae, Rmse: parsed.Rmse, R2: parsed.R2})
	}
	return points, rows.Err()
}

type JobTypeHealth struct {
	JobType            string   `json:"jobType"`
	Succeeded          int64    `json:"succeeded"`
	Partial            int64    `json:"partial"`
	Failed             int64    `json:"failed"`
	AvgDurationSeconds *float64 `json:"avgDurationSeconds"`
}

// ETLHealthSummary rolls job_runs up by job_type: terminal-status counts
// plus average wall-clock duration, for the pipeline-health tile.
func (d *DB) ETLHealthSummary(ctx context.Context) ([]JobTypeHealth, error) {
	counts, err := d.pool.Query(ctx,
		`SELECT job_type, status, COUNT(*) FROM control_plane.job_runs
		 WHERE status IN ('succeeded', 'partial', 'failed')
		 GROUP BY job_type, status`,
	)
	if err != nil {
		return nil, fmt.Errorf("db: etl health counts: %w", err)
	}
	byType := map[string]*JobTypeHealth{}
	for counts.Next() {
		var jobType, status string
		var count int64
		if err := counts.Scan(&jobType, &status, &count); err != nil {
			counts.Close()
			return nil, fmt.Errorf("db: scan etl health counts: %w", err)
		}
		h, ok := byType[jobType]
		if !ok {
			h = &JobTypeHealth{JobType: jobType}
			byType[jobType] = h
		}
		switch status {
		case "succeeded":
			h.Succeeded = count
		case "partial":
			h.Partial = count
		case "failed":
			h.Failed = count
		}
	}
	counts.Close()
	if err := counts.Err(); err != nil {
		return nil, err
	}

	durations, err := d.pool.Query(ctx,
		`SELECT job_type, AVG(EXTRACT(EPOCH FROM (finished_at - started_at)))
		 FROM control_plane.job_runs
		 WHERE status IN ('succeeded', 'partial', 'failed') AND started_at IS NOT NULL AND finished_at IS NOT NULL
		 GROUP BY job_type`,
	)
	if err != nil {
		return nil, fmt.Errorf("db: etl health durations: %w", err)
	}
	for durations.Next() {
		var jobType string
		var avgSeconds *float64
		if err := durations.Scan(&jobType, &avgSeconds); err != nil {
			durations.Close()
			return nil, fmt.Errorf("db: scan etl health durations: %w", err)
		}
		if h, ok := byType[jobType]; ok {
			h.AvgDurationSeconds = avgSeconds
		}
	}
	durations.Close()
	if err := durations.Err(); err != nil {
		return nil, err
	}

	result := make([]JobTypeHealth, 0, len(byType))
	for _, h := range byType {
		result = append(result, *h)
	}
	return result, nil
}

// LatestSilverRowsProcessed returns the most recent succeeded silver run's
// row count -- the current size of the Silver dataset, not a cumulative
// sum across historical reruns.
func (d *DB) LatestSilverRowsProcessed(ctx context.Context) (*int64, error) {
	var rowsProcessed *int64
	err := d.pool.QueryRow(ctx,
		`SELECT rows_processed FROM control_plane.job_runs
		 WHERE job_type = 'silver' AND status = 'succeeded' AND rows_processed IS NOT NULL
		 ORDER BY finished_at DESC LIMIT 1`,
	).Scan(&rowsProcessed)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("db: latest silver rows processed: %w", err)
	}
	return rowsProcessed, nil
}

// LatestFareModelMae returns the most recent succeeded train run's MAE.
func (d *DB) LatestFareModelMae(ctx context.Context) (*float64, error) {
	var raw []byte
	err := d.pool.QueryRow(ctx,
		`SELECT metrics FROM control_plane.job_runs
		 WHERE job_type = 'train' AND status = 'succeeded' AND metrics IS NOT NULL
		 ORDER BY finished_at DESC LIMIT 1`,
	).Scan(&raw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("db: latest fare model mae: %w", err)
	}
	var parsed struct {
		Mae *float64 `json:"mae"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("db: unmarshal fare model mae: %w", err)
	}
	return parsed.Mae, nil
}

// IngestedMonthsCount counts distinct "YYYY-MM" months covered by every
// succeeded/partial ingest run's params range -- no separate manifest
// table needed, job_runs.params already has everything.
func (d *DB) IngestedMonthsCount(ctx context.Context) (int, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT params FROM control_plane.job_runs WHERE job_type = 'ingest' AND status IN ('succeeded', 'partial')`,
	)
	if err != nil {
		return 0, fmt.Errorf("db: ingested months: %w", err)
	}
	defer rows.Close()

	months := map[string]struct{}{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return 0, fmt.Errorf("db: scan ingest params: %w", err)
		}
		var params struct {
			Start string `json:"start"`
			End   string `json:"end"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			continue // malformed/legacy params -- skip rather than fail the whole count
		}
		for _, m := range expandMonthRange(params.Start, params.End) {
			months[m] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	return len(months), nil
}

func expandMonthRange(start, end string) []string {
	startT, errStart := time.Parse("2006-01", start)
	endT, errEnd := time.Parse("2006-01", end)
	if errStart != nil || errEnd != nil || endT.Before(startT) {
		return nil
	}
	var months []string
	for t := startT; !t.After(endT); t = t.AddDate(0, 1, 0) {
		months = append(months, t.Format("2006-01"))
	}
	return months
}
