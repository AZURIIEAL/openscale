// Package queryengine is the HTTP client for the DuckDB query service
// (query-engine/). The service is internal: it has no host port and only
// the control-plane calls it, passing the project's dataset list with
// every request so the service never needs the database and the
// control-plane stays the one place project scoping is decided.
package queryengine

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DatasetRef is what the service needs to expose one dataset as a view:
// its SQL name and the glob of Parquet files behind it.
type DatasetRef struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// QueryRequest mirrors query-engine's /query body.
type QueryRequest struct {
	ProjectID      string       `json:"project_id"`
	SQL            string       `json:"sql"`
	Datasets       []DatasetRef `json:"datasets"`
	MaxRows        int          `json:"max_rows"`
	TimeoutSeconds int          `json:"timeout_seconds"`
}

// Column is one result column.
type Column struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// Result is the shape the SQL editor already consumes from /api/query, so
// swapping the backend needs no frontend change. Error is set instead of
// the data fields when the SQL was rejected or failed; the HTTP status is
// still 200 in that case so the editor can show the message inline.
type Result struct {
	Columns    []Column `json:"columns,omitempty"`
	Rows       [][]any  `json:"rows,omitempty"`
	RowCount   int      `json:"rowCount"`
	Truncated  bool     `json:"truncated"`
	DurationMs int64    `json:"durationMs"`
	Error      string   `json:"error,omitempty"`
}

// ProfileColumn is one entry of a dataset profile.
type ProfileColumn struct {
	Name      string   `json:"name"`
	Type      string   `json:"type"`
	NullCount int64    `json:"nullCount"`
	NullShare float64  `json:"nullShare"`
	Distinct  *int64   `json:"distinct,omitempty"`
	Min       any      `json:"min,omitempty"`
	Max       any      `json:"max,omitempty"`
	Mean      *float64 `json:"mean,omitempty"`
}

// Profile is the /profile response.
type Profile struct {
	RowCount int64           `json:"rowCount"`
	Columns  []ProfileColumn `json:"columns"`
	Error    string          `json:"error,omitempty"`
}

// Client talks to one query-engine instance.
type Client struct {
	baseURL string
	http    *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		// Generous: the service enforces the real per-query timeout itself
		// and reports it inside the body; this only guards a hung socket.
		http: &http.Client{Timeout: 5 * time.Minute},
	}
}

// Query runs one read-only SQL statement over the project's datasets.
func (c *Client) Query(ctx context.Context, req QueryRequest) (Result, error) {
	var out Result
	if err := c.post(ctx, "/query", req, &out); err != nil {
		return Result{}, err
	}
	return out, nil
}

// Preview returns the first limit rows of one dataset.
func (c *Client) Preview(ctx context.Context, projectID string, ds DatasetRef, limit int) (Result, error) {
	var out Result
	body := map[string]any{"project_id": projectID, "dataset": ds, "limit": limit}
	if err := c.post(ctx, "/preview", body, &out); err != nil {
		return Result{}, err
	}
	return out, nil
}

// ProfileDataset computes per-column statistics for one dataset.
func (c *Client) ProfileDataset(ctx context.Context, projectID string, ds DatasetRef) (Profile, error) {
	var out Profile
	body := map[string]any{"project_id": projectID, "dataset": ds}
	if err := c.post(ctx, "/profile", body, &out); err != nil {
		return Profile{}, err
	}
	return out, nil
}

func (c *Client) post(ctx context.Context, path string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("queryengine: encode request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("queryengine: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("queryengine: %s: %w", path, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return fmt.Errorf("queryengine: read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("queryengine: %s returned %d: %s", path, resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("queryengine: decode response: %w", err)
	}
	return nil
}
