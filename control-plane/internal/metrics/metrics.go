// Package metrics is the only package importing the Prometheus client --
// it owns the registry, the HTTP instrumentation middleware, and the
// job-run collector, and exposes them as a plain http.Handler for
// GET /metrics. Prometheus (observability/prometheus/prometheus.yml)
// scrapes that endpoint; nothing outside this package touches
// client_golang directly.
package metrics

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
)

// JobRunCounter is the read side the job-run collector needs -- satisfied
// by *db.DB, declared here so this package never imports internal/db.
type JobRunCounter interface {
	CountJobRunsByStatus(ctx context.Context) ([]jobs.StatusCount, error)
}

type Metrics struct {
	registry *prometheus.Registry
	requests *prometheus.CounterVec
	duration *prometheus.HistogramVec
}

func New(jobRuns JobRunCounter) *Metrics {
	m := &Metrics{
		registry: prometheus.NewRegistry(),
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "openscale_http_requests_total",
			Help: "HTTP requests served by the control-plane, by route pattern and status code.",
		}, []string{"method", "route", "status"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "openscale_http_request_duration_seconds",
			Help:    "HTTP request latency by route pattern.",
			Buckets: prometheus.DefBuckets,
		}, []string{"method", "route"}),
	}
	m.registry.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
		m.requests,
		m.duration,
		&jobRunCollector{source: jobRuns},
	)
	return m
}

// Handler serves the registry in the Prometheus exposition format.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}

// Middleware records a request count and latency per chi route pattern
// (e.g. /api/jobs/{type}/run), never the raw path, so job IDs can't blow up
// label cardinality. WebSocket upgrades are skipped -- their "duration" is
// the whole connection lifetime, which would swamp the latency histogram.
func (m *Metrics) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Upgrade") == "websocket" {
			next.ServeHTTP(w, r)
			return
		}

		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)

		route := "unmatched"
		if rctx := chi.RouteContext(r.Context()); rctx != nil && rctx.RoutePattern() != "" {
			route = rctx.RoutePattern()
		}
		status := ww.Status()
		if status == 0 {
			status = http.StatusOK
		}
		m.requests.WithLabelValues(r.Method, route, strconv.Itoa(status)).Inc()
		m.duration.WithLabelValues(r.Method, route).Observe(time.Since(start).Seconds())
	})
}

var jobRunsDesc = prometheus.NewDesc(
	"openscale_job_runs",
	"Job runs currently recorded in Postgres, by job type and status.",
	[]string{"job_type", "status"}, nil,
)

// jobRunCollector reads job_runs counts from Postgres at scrape time rather
// than counting in-process: the worker, not the control-plane, writes most
// status transitions, and the table survives control-plane restarts.
type jobRunCollector struct {
	source JobRunCounter
}

func (c *jobRunCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- jobRunsDesc
}

func (c *jobRunCollector) Collect(ch chan<- prometheus.Metric) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	counts, err := c.source.CountJobRunsByStatus(ctx)
	if err != nil {
		ch <- prometheus.NewInvalidMetric(jobRunsDesc, err)
		return
	}
	for _, sc := range counts {
		ch <- prometheus.MustNewConstMetric(jobRunsDesc, prometheus.GaugeValue, float64(sc.Count), sc.JobType, string(sc.Status))
	}
}
