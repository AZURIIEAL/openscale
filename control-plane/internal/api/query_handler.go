package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
)

// QueryHandler serves the SQL Editor's ad-hoc, read-only queries against
// Postgres. Deliberately Postgres-only -- querying Bronze/Silver Parquet
// on MinIO directly (see ideas/tech-stack.md's DuckDB plan) is a separate,
// much larger effort and out of scope here.
type QueryHandler struct {
	db *db.DB
}

func NewQueryHandler(database *db.DB) *QueryHandler {
	return &QueryHandler{db: database}
}

const (
	queryTimeout = 10 * time.Second
	maxQueryRows = 500
)

type queryRequest struct {
	SQL string `json:"sql"`
}

type queryResponse struct {
	Columns    []string `json:"columns,omitempty"`
	Rows       [][]any  `json:"rows,omitempty"`
	RowCount   int      `json:"rowCount"`
	DurationMs int64    `json:"durationMs"`
	Truncated  bool     `json:"truncated"`
	Error      string   `json:"error,omitempty"`
}

// Run handles POST /api/query. Always responds HTTP 200 for query-level
// outcomes, success or failure alike -- a SQL syntax error is a normal
// *result* of running a query, not a transport failure, so it travels back
// as {"error": "..."} inside a 200 body rather than a non-2xx status (the
// frontend's apiPost throws on any non-2xx without exposing the body, so a
// non-200 here would make the error unreadable). Non-200 is reserved for
// actual infra failures, like a malformed JSON request body.
func (h *QueryHandler) Run(w http.ResponseWriter, r *http.Request) {
	var req queryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if reason, ok := validateReadOnlySQL(req.SQL); !ok {
		_ = json.NewEncoder(w).Encode(queryResponse{Error: reason})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	start := time.Now()
	result, err := h.db.RunReadOnlyQuery(ctx, req.SQL, maxQueryRows)
	duration := time.Since(start)
	if err != nil {
		_ = json.NewEncoder(w).Encode(queryResponse{Error: err.Error()})
		return
	}

	_ = json.NewEncoder(w).Encode(queryResponse{
		Columns:    result.Columns,
		Rows:       result.Rows,
		RowCount:   len(result.Rows),
		DurationMs: duration.Milliseconds(),
		Truncated:  result.Truncated,
	})
}

// Catalog handles GET /api/query/catalog, backing the SQL Editor's schema
// browser with the database's real, live table/column list instead of a
// hardcoded guess (tables like gold_* and zone_hour_features are written
// by the worker at runtime and may not exist yet on a fresh deploy).
func (h *QueryHandler) Catalog(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	catalog, err := h.db.ListQueryCatalog(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(catalog)
}

// validateReadOnlySQL is the fail-fast half of the safety design -- a
// quick, cheap rejection of anything obviously not a read, before the
// query ever reaches Postgres. It is NOT the real enforcement: the
// read-only transaction in RunReadOnlyQuery is what actually stops a
// write that slips past this check (e.g. a SELECT that hides a
// side-effecting function call). Returns a user-facing rejection reason
// and false when the SQL is rejected.
func validateReadOnlySQL(sql string) (string, bool) {
	if strings.TrimSpace(sql) == "" {
		return "SQL query cannot be empty.", false
	}

	body := trimLeadingSQLNoise(sql)
	lower := strings.ToLower(body)
	if !strings.HasPrefix(lower, "select") && !strings.HasPrefix(lower, "with") {
		return "Only SELECT queries are allowed.", false
	}

	if len(nonEmptyStatements(sql)) > 1 {
		return "Only a single SQL statement is allowed.", false
	}

	return "", true
}

// trimLeadingSQLNoise strips leading whitespace and comments (-- line,
// /* block */) so the SELECT/WITH prefix check isn't fooled by a query
// that merely starts with a comment.
func trimLeadingSQLNoise(sql string) string {
	s := sql
	for {
		next := strings.TrimLeft(s, " \t\r\n")
		switch {
		case strings.HasPrefix(next, "--"):
			if idx := strings.IndexByte(next, '\n'); idx >= 0 {
				next = next[idx+1:]
			} else {
				next = ""
			}
		case strings.HasPrefix(next, "/*"):
			if idx := strings.Index(next, "*/"); idx >= 0 {
				next = next[idx+2:]
			} else {
				next = ""
			}
		}
		if next == s {
			return next
		}
		s = next
	}
}

// nonEmptyStatements splits sql on ';' and returns the segments that
// aren't pure whitespace, tolerating one optional trailing ';'.
func nonEmptyStatements(sql string) []string {
	parts := strings.Split(sql, ";")
	statements := make([]string, 0, len(parts))
	for _, p := range parts {
		if strings.TrimSpace(p) != "" {
			statements = append(statements, p)
		}
	}
	return statements
}
