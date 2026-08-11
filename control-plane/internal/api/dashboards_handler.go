package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
)

// DashboardsHandler serves the Dashboards screen's aggregate reads and
// Home's stat cards -- both are pure reads over data other jobs already
// wrote (Gold tables, job_runs), no writes of their own.
type DashboardsHandler struct {
	db *db.DB
}

func NewDashboardsHandler(database *db.DB) *DashboardsHandler {
	return &DashboardsHandler{db: database}
}

const topZonesLimit = 10

type DashboardsOverview struct {
	DailyRevenue []db.DailyRevenuePoint `json:"dailyRevenue"`
	HourlyDemand []db.HourlyDemandPoint `json:"hourlyDemand"`
	TopZones     []db.ZoneStat          `json:"topZones"`
	Congestion   []db.CongestionPoint   `json:"congestion"`
	ModelMetrics []db.TrainMetricPoint  `json:"modelMetrics"`
	EtlHealth    []db.JobTypeHealth     `json:"etlHealth"`
}

// Overview handles GET /api/dashboards/overview, composing every chart
// tile's data into one payload so the frontend needs one query/loading
// state instead of 6.
func (h *DashboardsHandler) Overview(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	dailyRevenue, err := h.db.ListGoldDailyRevenue(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	hourlyDemand, err := h.db.ListGoldHourlyDemand(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	topZones, err := h.db.ListGoldTopZones(ctx, topZonesLimit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	congestion, err := h.db.ListGoldCongestion(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	modelMetrics, err := h.db.ListTrainMetrics(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	etlHealth, err := h.db.ETLHealthSummary(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(DashboardsOverview{
		DailyRevenue: dailyRevenue,
		HourlyDemand: hourlyDemand,
		TopZones:     topZones,
		Congestion:   congestion,
		ModelMetrics: modelMetrics,
		EtlHealth:    etlHealth,
	})
}

type HomeStats struct {
	SilverRowsProcessed *int64                 `json:"silverRowsProcessed"`
	MonthsIngested      int                    `json:"monthsIngested"`
	FareModelMae        *float64               `json:"fareModelMae"`
	RevenueTrend14d     []db.DailyRevenuePoint `json:"revenueTrend14d"`
}

// HomeStats handles GET /api/home/stats, backing Home's stat cards and
// revenue sparkline with real numbers instead of mockHomeGateway's.
func (h *DashboardsHandler) HomeStats(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	silverRows, err := h.db.LatestSilverRowsProcessed(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	monthsIngested, err := h.db.IngestedMonthsCount(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	fareModelMae, err := h.db.LatestFareModelMae(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	dailyRevenue, err := h.db.ListGoldDailyRevenue(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	revenueTrend14d := dailyRevenue
	if len(dailyRevenue) > 14 {
		revenueTrend14d = dailyRevenue[len(dailyRevenue)-14:]
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(HomeStats{
		SilverRowsProcessed: silverRows,
		MonthsIngested:      monthsIngested,
		FareModelMae:        fareModelMae,
		RevenueTrend14d:     revenueTrend14d,
	})
}
