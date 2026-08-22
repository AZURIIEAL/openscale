// Package jobs holds the job-run domain: plain types and pure rules, no
// framework/IO dependency -- mirrors internal/health exactly. internal/db
// and internal/redis translate into/out of these types; nothing outside
// this package (or a mirroring frontend type) needs to know about
// Postgres/Redis/sqlc.
package jobs

import (
	"encoding/json"
	"time"
)

// Status is a job run's lifecycle state.
type Status string

const (
	StatusQueued    Status = "queued"
	StatusRunning   Status = "running"
	StatusSucceeded Status = "succeeded"
	// StatusPartial: some periods/units in the run succeeded and some
	// failed (e.g. an ingest range where one month was schema-rejected but
	// the rest landed in Bronze) -- distinct from StatusFailed, where
	// nothing succeeded at all.
	StatusPartial Status = "partial"
	StatusFailed  Status = "failed"
	// StatusCancelled: the run was stopped by a user-initiated cancel-all
	// before it reached a natural terminal state -- distinct from
	// StatusFailed, which means the job itself errored out.
	StatusCancelled Status = "cancelled"
)

// Run is one triggered job execution.
type Run struct {
	ID          string          `json:"id"`
	JobType     string          `json:"jobType"`
	Params      json.RawMessage `json:"params"`
	Status      Status          `json:"status"`
	SubmittedAt time.Time       `json:"submittedAt"`
	StartedAt   *time.Time      `json:"startedAt,omitempty"`
	FinishedAt  *time.Time      `json:"finishedAt,omitempty"`
	Error       *string         `json:"error,omitempty"`
	LogOutput   *string         `json:"logOutput,omitempty"`
	// RowsProcessed is set by the worker itself at mark_terminal time --
	// not every job type can report it cheaply (Gold's outputs are
	// aggregate tables, not a row-for-row count), so it stays nil there.
	RowsProcessed *int64 `json:"rowsProcessed,omitempty"`
}

// Definition describes one triggerable job type, shown in the frontend's
// job catalog. Kept as a small hardcoded list (mirrors watchedServices in
// internal/api/health_handler.go) rather than a database table -- this is
// deliberately Phase 2 scope ("control the existing pipeline"), not a
// generic bring-your-own-job system.
type Definition struct {
	Type        string `json:"type"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

var Catalog = []Definition{
	{Type: "ingest", Label: "Ingest (Bronze)", Description: "Download/validate TLC parquet, write to Bronze"},
	{Type: "silver", Label: "Validate (Silver)", Description: "Bronze -> Silver: reject/quarantine/flag invalid rows, write clean trips"},
	{Type: "gold", Label: "Aggregate (Gold)", Description: "Silver -> Gold: daily revenue, hourly demand, zone stats, congestion metrics"},
	{Type: "features", Label: "Compute Features", Description: "Silver -> zone x hour features, written to Postgres and Redis"},
	{Type: "train", Label: "Train Fare Model", Description: "Samples Silver trips, trains a fare-prediction model, logs it to MLflow"},
	// "replay" is deliberately excluded from the frontend's own JOB_CATALOG
	// mirror too, same reason as "reset" below: it isn't a normal pipeline
	// stage (it doesn't write Bronze/Silver/Gold), it's only reachable
	// through the Streaming screen's own replay control, which calls
	// POST /api/jobs/replay/run directly.
	{Type: "replay", Label: "Replay Trips", Description: "Replays real Silver trips onto Kafka's yellow-taxi-trips topic, at a configurable rate"},
	// "reset" is deliberately excluded from the frontend's own JOB_CATALOG
	// mirror (frontend/src/domains/pipelines/domain/entities.ts) so it never
	// shows up as a normal pipeline stage -- it's only reachable through the
	// Pipelines screen's dedicated "Clear Data" control. It's listed here so
	// IsKnownJobType/Run accept it like any other job type.
	{Type: "reset", Label: "Clear Data", Description: "Wipe Bronze/Silver/Gold objects in MinIO and Gold/feature tables in Postgres"},
}

// IsKnownJobType reports whether type is triggerable -- checked before
// ever inserting a job_runs row or enqueuing onto Redis.
func IsKnownJobType(jobType string) bool {
	for _, d := range Catalog {
		if d.Type == jobType {
			return true
		}
	}
	return false
}
