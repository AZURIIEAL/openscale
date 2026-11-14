package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/AZURIIEAL/openscale/control-plane/internal/datasets"
)

const datasetColumns = `id::text, project_id::text, name, layer, status, source, columns, profile,
	row_count, size_bytes, rules, error, created_at, updated_at`

func scanDataset(row pgx.Row) (datasets.Dataset, error) {
	var d datasets.Dataset
	var source, columns, profile, rules []byte
	err := row.Scan(&d.ID, &d.ProjectID, &d.Name, &d.Layer, &d.Status, &source, &columns, &profile,
		&d.RowCount, &d.SizeBytes, &rules, &d.Error, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		return datasets.Dataset{}, err
	}
	if err := json.Unmarshal(source, &d.Source); err != nil {
		return datasets.Dataset{}, fmt.Errorf("db: dataset %s: bad source json: %w", d.ID, err)
	}
	d.Columns = []datasets.Column{}
	if len(columns) > 0 {
		if err := json.Unmarshal(columns, &d.Columns); err != nil {
			return datasets.Dataset{}, fmt.Errorf("db: dataset %s: bad columns json: %w", d.ID, err)
		}
	}
	if len(profile) > 0 {
		d.Profile = json.RawMessage(profile)
	}
	d.Rules = json.RawMessage(rules)
	if len(d.Rules) == 0 {
		d.Rules = json.RawMessage("[]")
	}
	return d, nil
}

// CreateDataset inserts a pending dataset row. The lake files are written
// by the caller (upload) or the worker (url) afterwards.
func (d *DB) CreateDataset(ctx context.Context, projectID, name, layer string, source datasets.Source) (datasets.Dataset, error) {
	sourceJSON, err := json.Marshal(source)
	if err != nil {
		return datasets.Dataset{}, fmt.Errorf("db: encode dataset source: %w", err)
	}
	row := d.pool.QueryRow(ctx,
		`INSERT INTO control_plane.datasets (project_id, name, layer, source)
		 VALUES ($1::uuid, $2, $3, $4::jsonb) RETURNING `+datasetColumns,
		projectID, name, layer, sourceJSON,
	)
	ds, err := scanDataset(row)
	if err != nil {
		if isUniqueViolation(err) {
			return datasets.Dataset{}, fmt.Errorf("db: create dataset: name %q: %w", name, ErrConflict)
		}
		return datasets.Dataset{}, fmt.Errorf("db: create dataset: %w", err)
	}
	return ds, nil
}

// ListDatasets returns a project's datasets, oldest first.
func (d *DB) ListDatasets(ctx context.Context, projectID string) ([]datasets.Dataset, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT `+datasetColumns+` FROM control_plane.datasets WHERE project_id = $1::uuid ORDER BY created_at, name`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("db: list datasets: %w", err)
	}
	defer rows.Close()

	out := []datasets.Dataset{}
	for rows.Next() {
		ds, err := scanDataset(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, ds)
	}
	return out, rows.Err()
}

// GetDataset fetches one dataset of a project by name.
func (d *DB) GetDataset(ctx context.Context, projectID, name string) (datasets.Dataset, error) {
	row := d.pool.QueryRow(ctx,
		`SELECT `+datasetColumns+` FROM control_plane.datasets WHERE project_id = $1::uuid AND name = $2`,
		projectID, name,
	)
	ds, err := scanDataset(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return datasets.Dataset{}, fmt.Errorf("db: dataset %q: %w", name, ErrNotFound)
		}
		return datasets.Dataset{}, fmt.Errorf("db: get dataset %q: %w", name, err)
	}
	return ds, nil
}

// MarkDatasetPending resets a dataset to pending before a re-ingest (a new
// file was added), clearing a previous error.
func (d *DB) MarkDatasetPending(ctx context.Context, id string) error {
	_, err := d.pool.Exec(ctx,
		`UPDATE control_plane.datasets SET status = 'pending', error = NULL, updated_at = now() WHERE id = $1::uuid`, id)
	if err != nil {
		return fmt.Errorf("db: mark dataset pending: %w", err)
	}
	return nil
}

// MarkDatasetFailed records a failure the control-plane itself hit (for
// example the upload to MinIO failed after the row was inserted).
func (d *DB) MarkDatasetFailed(ctx context.Context, id, reason string) error {
	_, err := d.pool.Exec(ctx,
		`UPDATE control_plane.datasets SET status = 'failed', error = $2, updated_at = now() WHERE id = $1::uuid`, id, reason)
	if err != nil {
		return fmt.Errorf("db: mark dataset failed: %w", err)
	}
	return nil
}

// DeleteDataset removes the row. The caller removes the lake prefix.
func (d *DB) DeleteDataset(ctx context.Context, id string) error {
	tag, err := d.pool.Exec(ctx, `DELETE FROM control_plane.datasets WHERE id = $1::uuid`, id)
	if err != nil {
		return fmt.Errorf("db: delete dataset: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("db: dataset %s: %w", id, ErrNotFound)
	}
	return nil
}
