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

// IsTerminal reports whether a run in status s will never change again.
// Cancelled counts: a WebSocket tail opened on a cancelled run must close
// instead of waiting forever for a status that will not come.
func IsTerminal(s Status) bool {
	switch s {
	case StatusSucceeded, StatusPartial, StatusFailed, StatusCancelled:
		return true
	}
	return false
}

// Run is one triggered job execution.
type Run struct {
	ID          string          `json:"id"`
	ProjectID   string          `json:"projectId"`
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

// StatusCount is how many runs of one job type sit in one status --
// exported as the openscale_job_runs gauge by internal/metrics.
type StatusCount struct {
	JobType string
	Status  Status
	Count   int64
}
