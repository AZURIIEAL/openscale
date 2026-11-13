package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/AZURIIEAL/openscale/control-plane/internal/projects"
)

// ErrNotFound is returned for a missing project so handlers can answer 404
// without inspecting pgx errors.
var ErrNotFound = errors.New("not found")

// ErrConflict is returned when a slug is already taken.
var ErrConflict = errors.New("conflict")

const projectColumns = `id::text, slug, name, description, features, ai_settings, created_at, archived_at`

func scanProject(row pgx.Row) (projects.Project, error) {
	var p projects.Project
	var features, aiSettings []byte
	err := row.Scan(&p.ID, &p.Slug, &p.Name, &p.Description, &features, &aiSettings, &p.CreatedAt, &p.ArchivedAt)
	if err != nil {
		return projects.Project{}, err
	}
	p.Features = json.RawMessage(features)
	p.AISettings = json.RawMessage(aiSettings)
	return p, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// CreateProject inserts a project. The caller is expected to have run
// CreateInput.Normalize first; this only maps the unique-slug violation.
func (d *DB) CreateProject(ctx context.Context, in projects.CreateInput) (projects.Project, error) {
	row := d.pool.QueryRow(ctx,
		`INSERT INTO control_plane.projects (slug, name, description)
		 VALUES ($1, $2, $3) RETURNING `+projectColumns,
		in.Slug, in.Name, in.Description,
	)
	p, err := scanProject(row)
	if err != nil {
		if isUniqueViolation(err) {
			return projects.Project{}, fmt.Errorf("db: create project: slug %q: %w", in.Slug, ErrConflict)
		}
		return projects.Project{}, fmt.Errorf("db: create project: %w", err)
	}
	return p, nil
}

// ListProjects returns every project that is not archived, oldest first so
// the sample project stays at the top of a fresh install's switcher.
func (d *DB) ListProjects(ctx context.Context) ([]projects.Project, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT `+projectColumns+` FROM control_plane.projects
		 WHERE archived_at IS NULL ORDER BY created_at, slug`,
	)
	if err != nil {
		return nil, fmt.Errorf("db: list projects: %w", err)
	}
	defer rows.Close()

	out := []projects.Project{}
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, fmt.Errorf("db: scan project: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetProject fetches one project by id or by slug (see projects.LooksLikeID).
// Archived projects are still returned so their history stays reachable.
func (d *DB) GetProject(ctx context.Context, idOrSlug string) (projects.Project, error) {
	where := `slug = $1`
	if projects.LooksLikeID(idOrSlug) {
		where = `id = $1::uuid`
	}
	row := d.pool.QueryRow(ctx, `SELECT `+projectColumns+` FROM control_plane.projects WHERE `+where, idOrSlug)
	p, err := scanProject(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return projects.Project{}, fmt.Errorf("db: project %q: %w", idOrSlug, ErrNotFound)
		}
		return projects.Project{}, fmt.Errorf("db: get project %q: %w", idOrSlug, err)
	}
	return p, nil
}

// UpdateProject applies a partial update; nil fields keep their value.
func (d *DB) UpdateProject(ctx context.Context, id string, in projects.UpdateInput) (projects.Project, error) {
	var aiSettings []byte
	if in.AISettings != nil {
		aiSettings = *in.AISettings
	}
	row := d.pool.QueryRow(ctx,
		`UPDATE control_plane.projects
		 SET name        = COALESCE($2, name),
		     description = COALESCE($3, description),
		     ai_settings = COALESCE($4::jsonb, ai_settings)
		 WHERE id = $1::uuid
		 RETURNING `+projectColumns,
		id, in.Name, in.Description, aiSettings,
	)
	p, err := scanProject(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return projects.Project{}, fmt.Errorf("db: project %q: %w", id, ErrNotFound)
		}
		return projects.Project{}, fmt.Errorf("db: update project %q: %w", id, err)
	}
	return p, nil
}

// ArchiveProject hides a project from listings without deleting its runs.
// Hard deletes wait until there is a lake prefix to remove alongside.
func (d *DB) ArchiveProject(ctx context.Context, id string) error {
	tag, err := d.pool.Exec(ctx,
		`UPDATE control_plane.projects SET archived_at = now() WHERE id = $1::uuid AND archived_at IS NULL`, id,
	)
	if err != nil {
		return fmt.Errorf("db: archive project %q: %w", id, err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("db: project %q: %w", id, ErrNotFound)
	}
	return nil
}
