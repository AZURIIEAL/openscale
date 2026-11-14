package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
)

// The worker writes this table (worker/db.py's publish_job_definitions);
// the control-plane only reads it.
const jobDefinitionColumns = `type, label, description, COALESCE(stage, ''), params_schema, listed`

func scanJobDefinition(row pgx.Row) (jobs.Definition, error) {
	var d jobs.Definition
	var schema []byte
	if err := row.Scan(&d.Type, &d.Label, &d.Description, &d.Stage, &schema, &d.Listed); err != nil {
		return jobs.Definition{}, err
	}
	d.ParamsSchema = []jobs.ParamSpec{}
	if len(schema) > 0 {
		if err := json.Unmarshal(schema, &d.ParamsSchema); err != nil {
			return jobs.Definition{}, fmt.Errorf("db: job definition %s: bad params_schema json: %w", d.Type, err)
		}
	}
	return d, nil
}

// ListJobDefinitions returns every job type the worker currently publishes,
// in catalog order.
func (d *DB) ListJobDefinitions(ctx context.Context) ([]jobs.Definition, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT `+jobDefinitionColumns+` FROM control_plane.job_definitions
		 WHERE retired_at IS NULL ORDER BY sort_order, type`,
	)
	if err != nil {
		return nil, fmt.Errorf("db: list job definitions: %w", err)
	}
	defer rows.Close()

	defs := []jobs.Definition{}
	for rows.Next() {
		def, err := scanJobDefinition(rows)
		if err != nil {
			return nil, fmt.Errorf("db: scan job definition: %w", err)
		}
		defs = append(defs, def)
	}
	return defs, rows.Err()
}

// GetJobDefinition returns one published job type, or ErrNotFound when the
// worker has never published it or has retired it.
func (d *DB) GetJobDefinition(ctx context.Context, jobType string) (jobs.Definition, error) {
	row := d.pool.QueryRow(ctx,
		`SELECT `+jobDefinitionColumns+` FROM control_plane.job_definitions
		 WHERE type = $1 AND retired_at IS NULL`,
		jobType,
	)
	def, err := scanJobDefinition(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return jobs.Definition{}, fmt.Errorf("db: job definition %q: %w", jobType, ErrNotFound)
		}
		return jobs.Definition{}, fmt.Errorf("db: get job definition %q: %w", jobType, err)
	}
	return def, nil
}
