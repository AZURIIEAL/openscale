package db

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	migrations "github.com/AZURIIEAL/openscale/control-plane/db"
)

// Migrate applies every .sql file under db/migrations, in filename order,
// inside a transaction each, tracked by a schema_migrations bookkeeping
// table so re-running on every startup is a no-op once applied. No
// migration library (golang-migrate/goose) -- one migration file this
// round doesn't justify the dependency.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS control_plane.schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		// control_plane schema may not exist yet on the very first run --
		// create it unconditionally before the bookkeeping table.
		if _, schemaErr := pool.Exec(ctx, `CREATE SCHEMA IF NOT EXISTS control_plane`); schemaErr != nil {
			return fmt.Errorf("db: create control_plane schema: %w", schemaErr)
		}
		if _, err := pool.Exec(ctx, `
			CREATE TABLE IF NOT EXISTS control_plane.schema_migrations (
				version TEXT PRIMARY KEY,
				applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
			)`); err != nil {
			return fmt.Errorf("db: create schema_migrations: %w", err)
		}
	}

	entries, err := migrations.FS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("db: read embedded migrations: %w", err)
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var applied bool
		if err := pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM control_plane.schema_migrations WHERE version = $1)`, name,
		).Scan(&applied); err != nil {
			return fmt.Errorf("db: check migration %s: %w", name, err)
		}
		if applied {
			continue
		}

		sqlBytes, err := migrations.FS.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("db: read migration %s: %w", name, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("db: begin tx for %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, string(sqlBytes)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("db: apply migration %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO control_plane.schema_migrations (version) VALUES ($1)`, name,
		); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("db: record migration %s: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("db: commit migration %s: %w", name, err)
		}
	}

	return nil
}
