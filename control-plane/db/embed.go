// Package migrations embeds the SQL migration files under db/migrations so
// internal/db can apply them without shelling out to a migration tool or
// reading from disk at runtime -- works the same whether run via `go run`,
// `air`, or baked into the compiled Docker binary. go:embed can't traverse
// parent directories, which is why this tiny package lives right next to
// migrations/ instead of the embed directive being in internal/db.
package migrations

import "embed"

//go:embed all:migrations
var FS embed.FS
