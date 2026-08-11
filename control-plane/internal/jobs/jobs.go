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
