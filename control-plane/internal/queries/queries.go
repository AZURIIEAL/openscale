// Package queries holds saved queries: a named read-only SELECT and an
// optional chart spec. A project's dashboard is its saved queries that have
// a chart. Pure; internal/db stores them and internal/api serves them.
package queries

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/AZURIIEAL/openscale/control-plane/internal/sqlcheck"
)

// MaxSQL bounds one saved query's text.
const MaxSQL = 100_000

// ErrInvalid wraps every reason a saved query is refused (400).
var ErrInvalid = errors.New("invalid saved query")

// Chart types, as the dashboard draws them.
const (
	ChartLine   = "line"
	ChartBar    = "bar"
	ChartHBar   = "hbar"
	ChartNumber = "number"
)

// Chart says how a query's result becomes a dashboard tile: X labels the
// points (unused by number), Y is the numeric value.
type Chart struct {
	Type string `json:"type"`
	X    string `json:"x,omitempty"`
	Y    string `json:"y"`
}

// Query is a control_plane.saved_queries row.
type Query struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Name      string    `json:"name"`
	SQL       string    `json:"sql"`
	Chart     *Chart    `json:"chart,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

var namePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,62}$`)

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: "+format, append([]any{ErrInvalid}, args...)...)
}

// Normalize validates a query's name, SQL and chart, trimming them. The SQL
// is only shape-checked (one read-only statement); whether it runs is seen
// when it does, since the datasets it reads may not exist yet.
func Normalize(name, sql string, chart *Chart) (string, *Chart, error) {
	if !namePattern.MatchString(name) {
		return "", nil, invalid("name must start with a letter and contain only lowercase letters, digits and underscores (max 63 chars)")
	}
	sql = strings.TrimSpace(sql)
	if len(sql) > MaxSQL {
		return "", nil, invalid("sql must be at most %d characters", MaxSQL)
	}
	if reason, ok := sqlcheck.ValidateReadOnly(sql); !ok {
		return "", nil, invalid("%s", reason)
	}
	if chart == nil {
		return sql, nil, nil
	}
	c := Chart{Type: strings.TrimSpace(chart.Type), X: strings.TrimSpace(chart.X), Y: strings.TrimSpace(chart.Y)}
	switch c.Type {
	case ChartLine, ChartBar, ChartHBar:
		if c.X == "" {
			return "", nil, invalid("a %s chart needs an x column", c.Type)
		}
	case ChartNumber:
		c.X = ""
	default:
		return "", nil, invalid("chart type must be line, bar, hbar or number")
	}
	if c.Y == "" {
		return "", nil, invalid("a chart needs a y column")
	}
	return sql, &c, nil
}
