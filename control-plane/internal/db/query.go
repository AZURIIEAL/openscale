package db

import (
	"context"
	"encoding/hex"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// QueryResult is the generic shape of an ad-hoc SELECT's result set --
// unlike every other query in this package, the SQL Editor's queries
// aren't known ahead of time, so there's no fixed struct to scan into.
type QueryResult struct {
	Columns   []string
	Rows      [][]any
	Truncated bool
}

// RunReadOnlyQuery executes sql inside a read-only transaction so Postgres
// itself rejects any write that slips past the handler's SELECT/WITH
// prefix check (query_handler.go's validateReadOnlySQL) -- that check is
// just fail-fast UX, this transaction is the actual safety net. Reads at
// most maxRows rows, then stops and reports Truncated rather than
// buffering an unbounded result set.
func (d *DB) RunReadOnlyQuery(ctx context.Context, sql string, maxRows int) (QueryResult, error) {
	tx, err := d.pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return QueryResult{}, fmt.Errorf("db: begin read-only tx: %w", err)
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, sql)
	if err != nil {
		return QueryResult{}, err
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	columns := make([]string, len(fields))
	for i, f := range fields {
		columns[i] = string(f.Name)
	}

	result := QueryResult{Columns: columns, Rows: [][]any{}}
	for rows.Next() {
		if len(result.Rows) >= maxRows {
			result.Truncated = true
			break
		}
		values, err := rows.Values()
		if err != nil {
			return QueryResult{}, err
		}
		for i, v := range values {
			values[i] = normalizeQueryValue(v)
		}
		result.Rows = append(result.Rows, values)
	}
	if err := rows.Err(); err != nil {
		return QueryResult{}, err
	}
	rows.Close() // release the connection before Commit needs it

	if err := tx.Commit(ctx); err != nil {
		return QueryResult{}, fmt.Errorf("db: commit read-only tx: %w", err)
	}

	return result, nil
}

// normalizeQueryValue fixes up the one common Postgres type pgx's
// Values() leaves in a JSON-unfriendly shape: uuid decodes to a raw
// [16]byte array (which encoding/json renders as 16 bare numbers), not a
// string. That matters here because job_runs.id is exactly this type and
// is exactly the kind of column a SQL Editor user will select. Every other
// type pgx returns (text, int, float, bool, time.Time, pgtype.Numeric,
// jsonb as []byte, ...) already encodes to something reasonable as-is.
func normalizeQueryValue(v any) any {
	if b, ok := v.([16]byte); ok {
		return formatUUID(b)
	}
	return v
}

func formatUUID(src [16]byte) string {
	var buf [36]byte
	hex.Encode(buf[0:8], src[:4])
	buf[8] = '-'
	hex.Encode(buf[9:13], src[4:6])
	buf[13] = '-'
	hex.Encode(buf[14:18], src[6:8])
	buf[18] = '-'
	hex.Encode(buf[19:23], src[8:10])
	buf[23] = '-'
	hex.Encode(buf[24:], src[10:])
	return string(buf[:])
}

type CatalogColumn struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type CatalogTable struct {
	Schema  string          `json:"schema"`
	Table   string          `json:"table"`
	Columns []CatalogColumn `json:"columns"`
}

// excludedCatalogTables are control-plane's own bookkeeping tables --
// real Postgres tables, but not analytical data, so they'd just be noise
// in a SQL Editor's schema browser.
var excludedCatalogTables = map[string]bool{
	"control_plane.appearance_settings": true,
	"control_plane.schema_migrations":   true,
}

// ListQueryCatalog returns every queryable table (and its columns) across
// the public schema (where the worker writes gold_*/zone_hour_features
// directly, see dashboards.go's isUndefinedTable note) and control_plane
// (this service's own migrated schema), for the SQL Editor's schema
// browser. information_schema.columns is a system view that always
// exists, so a fresh database with none of the worker's tables created
// yet naturally yields an empty slice rather than an error.
func (d *DB) ListQueryCatalog(ctx context.Context) ([]CatalogTable, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT table_schema, table_name, column_name, data_type
		 FROM information_schema.columns
		 WHERE table_schema IN ('public', 'control_plane')
		 ORDER BY table_schema, table_name, ordinal_position`,
	)
	if err != nil {
		return nil, fmt.Errorf("db: list query catalog: %w", err)
	}
	defer rows.Close()

	order := []string{}
	byKey := map[string]*CatalogTable{}
	for rows.Next() {
		var schema, table, column, dataType string
		if err := rows.Scan(&schema, &table, &column, &dataType); err != nil {
			return nil, fmt.Errorf("db: scan query catalog: %w", err)
		}
		key := schema + "." + table
		if excludedCatalogTables[key] {
			continue
		}
		t, ok := byKey[key]
		if !ok {
			t = &CatalogTable{Schema: schema, Table: table}
			byKey[key] = t
			order = append(order, key)
		}
		t.Columns = append(t.Columns, CatalogColumn{Name: column, Type: dataType})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := make([]CatalogTable, 0, len(order))
	for _, key := range order {
		result = append(result, *byKey[key])
	}
	return result, nil
}
