package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/AZURIIEAL/openscale/control-plane/internal/datasets"
	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
	"github.com/AZURIIEAL/openscale/control-plane/internal/queryengine"
	"github.com/AZURIIEAL/openscale/control-plane/internal/sqlcheck"
)

// ProjectQueryHandler is the SQL editor's backend for a project's own
// datasets: SQL goes to the DuckDB query engine with the project's ready
// datasets attached as views. The legacy /api/query (Postgres) stays for
// the taxi sample project until its Gold tables become datasets too.
type ProjectQueryHandler struct {
	db      *db.DB
	engine  *queryengine.Client
	maxRows int
}

func NewProjectQueryHandler(database *db.DB, engine *queryengine.Client, maxRows int) *ProjectQueryHandler {
	return &ProjectQueryHandler{db: database, engine: engine, maxRows: maxRows}
}

const projectQueryTimeout = 60 * time.Second

// Run handles POST /api/projects/{p}/query. Same contract as QueryHandler.Run:
// query-level failures come back as {"error": ...} inside a 200 so the
// editor can show them inline; non-200 means the engine itself is down.
func (h *ProjectQueryHandler) Run(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())

	var req queryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	// The engine re-checks with DuckDB's own parser; this is the cheap
	// first pass that keeps obvious non-SELECTs off the wire.
	if reason, ok := sqlcheck.ValidateReadOnly(req.SQL); !ok {
		writeJSON(w, http.StatusOK, queryResponse{Error: reason})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), projectQueryTimeout+5*time.Second)
	defer cancel()

	refs, err := h.readyDatasetRefs(ctx, project.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	res, err := h.engine.Query(ctx, queryengine.QueryRequest{
		ProjectID:      project.ID,
		SQL:            req.SQL,
		Datasets:       refs,
		MaxRows:        h.maxRows,
		TimeoutSeconds: int(projectQueryTimeout / time.Second),
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, toQueryResponse(res))
}

// Catalog handles GET /api/projects/{p}/query/catalog: the project's ready
// datasets in the CatalogTable shape the editor's schema panel renders.
// Views live in DuckDB's default "main" schema.
func (h *ProjectQueryHandler) Catalog(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	list, err := h.db.ListDatasets(ctx, project.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	catalog := []db.CatalogTable{}
	for _, ds := range list {
		if ds.Status != datasets.StatusReady {
			continue
		}
		cols := make([]db.CatalogColumn, 0, len(ds.Columns))
		for _, c := range ds.Columns {
			cols = append(cols, db.CatalogColumn{Name: c.Name, Type: c.Type})
		}
		catalog = append(catalog, db.CatalogTable{Schema: "main", Table: ds.Name, Columns: cols})
	}
	writeJSON(w, http.StatusOK, catalog)
}

func (h *ProjectQueryHandler) readyDatasetRefs(ctx context.Context, projectID string) ([]queryengine.DatasetRef, error) {
	list, err := h.db.ListDatasets(ctx, projectID)
	if err != nil {
		return nil, err
	}
	refs := make([]queryengine.DatasetRef, 0, len(list))
	for _, ds := range list {
		if ds.Status == datasets.StatusReady {
			refs = append(refs, DatasetRef(ds))
		}
	}
	return refs, nil
}

// toQueryResponse flattens the engine's typed columns to the name list the
// existing editor consumes.
func toQueryResponse(res queryengine.Result) queryResponse {
	out := queryResponse{
		RowCount:   res.RowCount,
		DurationMs: res.DurationMs,
		Truncated:  res.Truncated,
		Error:      res.Error,
	}
	if res.Error != "" {
		return out
	}
	out.Columns = make([]string, len(res.Columns))
	for i, c := range res.Columns {
		out.Columns[i] = c.Name
	}
	out.Rows = res.Rows
	if out.Rows == nil {
		out.Rows = [][]any{}
	}
	return out
}
