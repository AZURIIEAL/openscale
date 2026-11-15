package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
	"github.com/AZURIIEAL/openscale/control-plane/internal/queries"
)

// SavedQueriesHandler serves a project's saved queries; the ones with a
// chart are its dashboard. Running one goes through the ordinary query
// endpoint, so the same sandbox applies.
type SavedQueriesHandler struct {
	db *db.DB
}

func NewSavedQueriesHandler(database *db.DB) *SavedQueriesHandler {
	return &SavedQueriesHandler{db: database}
}

// List handles GET /api/projects/{p}/saved-queries.
func (h *SavedQueriesHandler) List(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	list, err := h.db.ListSavedQueries(r.Context(), project.ID)
	if err != nil {
		writeSavedQueryErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// Put handles PUT /api/projects/{p}/saved-queries/{name}: create or
// replace, body {"sql", "chart"?}.
func (h *SavedQueriesHandler) Put(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	var body struct {
		SQL   string         `json:"sql"`
		Chart *queries.Chart `json:"chart"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2*queries.MaxSQL))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		http.Error(w, `expected {"sql", "chart"?}`, http.StatusBadRequest)
		return
	}
	name := chi.URLParam(r, "name")
	sql, chart, err := queries.Normalize(name, body.SQL, body.Chart)
	if err != nil {
		writeSavedQueryErr(w, err)
		return
	}
	q, err := h.db.SaveQuery(r.Context(), project.ID, name, sql, chart)
	if err != nil {
		writeSavedQueryErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, q)
}

// Delete handles DELETE /api/projects/{p}/saved-queries/{name}.
func (h *SavedQueriesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	if err := h.db.DeleteSavedQuery(r.Context(), project.ID, chi.URLParam(r, "name")); err != nil {
		writeSavedQueryErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeSavedQueryErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, queries.ErrInvalid):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, db.ErrNotFound):
		http.Error(w, "saved query not found", http.StatusNotFound)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
