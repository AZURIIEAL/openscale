package db

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/AZURIIEAL/openscale/control-plane/internal/bundle"
	"github.com/AZURIIEAL/openscale/control-plane/internal/datasets"
	"github.com/AZURIIEAL/openscale/control-plane/internal/projects"
)

// ImportProject creates a project with the bundle's datasets (pending, for
// the caller to queue their fetch), pipelines and saved queries, all or nothing. A taken
// slug is ErrConflict.
func (d *DB) ImportProject(ctx context.Context, b bundle.Bundle) (projects.Project, []datasets.Dataset, error) {
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return projects.Project{}, nil, fmt.Errorf("db: import project: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after Commit

	p, err := scanProject(tx.QueryRow(ctx,
		`INSERT INTO control_plane.projects (slug, name, description) VALUES ($1, $2, $3) RETURNING `+projectColumns,
		b.Project.Slug, b.Project.Name, b.Project.Description))
	if err != nil {
		if isUniqueViolation(err) {
			return p, nil, fmt.Errorf("db: import project: slug %q: %w", b.Project.Slug, ErrConflict)
		}
		return p, nil, fmt.Errorf("db: import project: %w", err)
	}

	created := make([]datasets.Dataset, 0, len(b.Datasets))
	for _, ds := range b.Datasets {
		source, _ := json.Marshal(datasets.Source{Kind: datasets.SourceURL, URL: ds.URL})
		rules, _ := json.Marshal(ds.Rules)
		row, err := scanDataset(tx.QueryRow(ctx,
			`INSERT INTO control_plane.datasets (project_id, name, layer, source, rules)
			 VALUES ($1::uuid, $2, $3, $4::jsonb, $5::jsonb) RETURNING `+datasetColumns,
			p.ID, ds.Name, ds.Layer, source, rules))
		if err != nil {
			return p, nil, fmt.Errorf("db: import dataset %s: %w", ds.Name, err)
		}
		created = append(created, row)
	}

	for _, pl := range b.Pipelines {
		steps, _ := json.Marshal(pl.Steps)
		if _, err := tx.Exec(ctx,
			`INSERT INTO control_plane.pipelines (project_id, name, description, steps) VALUES ($1::uuid, $2, $3, $4::jsonb)`,
			p.ID, pl.Name, pl.Description, steps); err != nil {
			return p, nil, fmt.Errorf("db: import pipeline %s: %w", pl.Name, err)
		}
	}
	for _, q := range b.Queries {
		if _, err := saveQuery(ctx, tx, p.ID, q.Name, q.SQL, q.Chart); err != nil {
			return p, nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return p, nil, fmt.Errorf("db: import project: %w", err)
	}
	return p, created, nil
}
