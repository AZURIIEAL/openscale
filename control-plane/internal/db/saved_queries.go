package db

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/AZURIIEAL/openscale/control-plane/internal/queries"
)

const savedQueryColumns = `id::text, project_id::text, name, sql, chart, created_at, updated_at`

func scanSavedQuery(row pgx.Row) (queries.Query, error) {
	var q queries.Query
	var chart []byte
	if err := row.Scan(&q.ID, &q.ProjectID, &q.Name, &q.SQL, &chart, &q.CreatedAt, &q.UpdatedAt); err != nil {
		return q, err
	}
	if len(chart) > 0 {
		if err := json.Unmarshal(chart, &q.Chart); err != nil {
			return q, fmt.Errorf("db: saved query %s: bad chart json: %w", q.ID, err)
		}
	}
	return q, nil
}

// ListSavedQueries returns a project's saved queries by name.
func (d *DB) ListSavedQueries(ctx context.Context, projectID string) ([]queries.Query, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT `+savedQueryColumns+` FROM control_plane.saved_queries WHERE project_id = $1::uuid ORDER BY name`, projectID)
	if err != nil {
		return nil, fmt.Errorf("db: list saved queries: %w", err)
	}
	defer rows.Close()
	out := []queries.Query{}
	for rows.Next() {
		q, err := scanSavedQuery(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

// SaveQuery creates or replaces a saved query by name.
func (d *DB) SaveQuery(ctx context.Context, projectID, name, sql string, chart *queries.Chart) (queries.Query, error) {
	return saveQuery(ctx, d.pool, projectID, name, sql, chart)
}

func saveQuery(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, projectID, name, sql string, chart *queries.Chart) (queries.Query, error) {
	var chartJSON []byte
	if chart != nil {
		chartJSON, _ = json.Marshal(chart)
	}
	saved, err := scanSavedQuery(q.QueryRow(ctx,
		`INSERT INTO control_plane.saved_queries (project_id, name, sql, chart) VALUES ($1::uuid, $2, $3, $4::jsonb)
		 ON CONFLICT (project_id, name) DO UPDATE SET sql = EXCLUDED.sql, chart = EXCLUDED.chart, updated_at = now()
		 RETURNING `+savedQueryColumns,
		projectID, name, sql, chartJSON))
	if err != nil {
		return saved, fmt.Errorf("db: save query %s: %w", name, err)
	}
	return saved, nil
}

// DeleteSavedQuery removes a saved query.
func (d *DB) DeleteSavedQuery(ctx context.Context, projectID, name string) error {
	tag, err := d.pool.Exec(ctx,
		`DELETE FROM control_plane.saved_queries WHERE project_id = $1::uuid AND name = $2`, projectID, name)
	if err != nil {
		return fmt.Errorf("db: delete saved query: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("db: saved query %s: %w", name, ErrNotFound)
	}
	return nil
}
