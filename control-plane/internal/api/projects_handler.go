package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/AZURIIEAL/openscale/control-plane/internal/bundle"
	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
	"github.com/AZURIIEAL/openscale/control-plane/internal/pipelines"
	"github.com/AZURIIEAL/openscale/control-plane/internal/projects"
)

// ProjectsHandler serves project CRUD plus the middleware that resolves
// `{projectId}` for every project-scoped route.
type ProjectsHandler struct {
	db         *db.DB
	dispatcher *Dispatcher
}

func NewProjectsHandler(database *db.DB, dispatcher *Dispatcher) *ProjectsHandler {
	return &ProjectsHandler{db: database, dispatcher: dispatcher}
}

// maxBundleBytes bounds a project file: definitions only, no data.
const maxBundleBytes = 4 << 20

type projectCtxKey struct{}

// ProjectFromContext returns the project the Middleware resolved for this
// request. The bool is false only on routes outside the project group.
func ProjectFromContext(ctx context.Context) (projects.Project, bool) {
	p, ok := ctx.Value(projectCtxKey{}).(projects.Project)
	return p, ok
}

// Middleware loads the project named by the `{projectId}` URL param (an id
// or a slug), answers 404 when it does not exist, and stores it in the
// request context so handlers never re-fetch it. This is the one place
// project scoping is enforced for the whole API.
func (h *ProjectsHandler) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		p, err := h.db.GetProject(ctx, chi.URLParam(r, "projectId"))
		if err != nil {
			writeProjectErr(w, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), projectCtxKey{}, p)))
	})
}

// List handles GET /api/projects.
func (h *ProjectsHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	list, err := h.db.ListProjects(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// Create handles POST /api/projects.
func (h *ProjectsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var in projects.CreateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	in, err := in.Normalize()
	if err != nil {
		writeProjectErr(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	p, err := h.db.CreateProject(ctx, in)
	if err != nil {
		writeProjectErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

// Get handles GET /api/projects/{projectId}. The middleware already loaded it.
func (h *ProjectsHandler) Get(w http.ResponseWriter, r *http.Request) {
	p, _ := ProjectFromContext(r.Context())
	writeJSON(w, http.StatusOK, p)
}

// Update handles PATCH /api/projects/{projectId}.
func (h *ProjectsHandler) Update(w http.ResponseWriter, r *http.Request) {
	p, _ := ProjectFromContext(r.Context())

	var in projects.UpdateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if err := in.Validate(); err != nil {
		writeProjectErr(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	updated, err := h.db.UpdateProject(ctx, p.ID, in)
	if err != nil {
		writeProjectErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// Archive handles DELETE /api/projects/{projectId}. It archives rather than
// deletes: job history stays, the project just leaves the switcher.
func (h *ProjectsHandler) Archive(w http.ResponseWriter, r *http.Request) {
	p, _ := ProjectFromContext(r.Context())

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.db.ArchiveProject(ctx, p.ID); err != nil {
		writeProjectErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Import handles POST /api/projects/import: a project file (see
// internal/bundle) becomes a new project with its datasets and pipelines,
// and each dataset's fetch is queued. The project lands even when a fetch
// can't be queued; that dataset is marked failed with the reason.
func (h *ProjectsHandler) Import(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBundleBytes))
	if err != nil {
		http.Error(w, "project file too large or unreadable", http.StatusBadRequest)
		return
	}
	b, err := bundle.Parse(raw)
	if err != nil {
		writeProjectErr(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	// A new project has no features, so feature-gated jobs are refused here.
	for _, p := range b.Pipelines {
		if err := checkSteps(ctx, h.db, p.Steps, projects.Project{}.HasFeature); err != nil {
			writeProjectErr(w, fmt.Errorf("pipeline %s: %w", p.Name, err))
			return
		}
	}
	p, created, err := h.db.ImportProject(ctx, b)
	if err != nil {
		writeProjectErr(w, err)
		return
	}
	for _, ds := range created {
		params, _ := json.Marshal(map[string]any{"dataset_id": ds.ID, "dataset_name": ds.Name, "url": ds.Source.URL})
		run, err := h.dispatcher.Dispatch(ctx, p.ID, jobDatasetFetch, params)
		switch {
		case err != nil:
			_ = h.db.MarkDatasetFailed(ctx, ds.ID, "could not queue "+jobDatasetFetch+": "+err.Error())
		case run.Error != nil:
			_ = h.db.MarkDatasetFailed(ctx, ds.ID, *run.Error)
		}
	}
	writeJSON(w, http.StatusCreated, p)
}

// Export handles GET /api/projects/{projectId}/export: the project as a
// file Import accepts.
func (h *ProjectsHandler) Export(w http.ResponseWriter, r *http.Request) {
	p, _ := ProjectFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	all, err := h.db.ListDatasets(ctx, p.ID)
	if err != nil {
		writeProjectErr(w, err)
		return
	}
	pls, err := h.db.ListPipelines(ctx, p.ID)
	if err != nil {
		writeProjectErr(w, err)
		return
	}
	b, err := bundle.Export(p, all, pls)
	if err != nil {
		writeProjectErr(w, err)
		return
	}
	out, err := json.MarshalIndent(b, "", "  ")
	if err != nil {
		writeProjectErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", `attachment; filename="`+p.Slug+`.json"`)
	_, _ = w.Write(append(out, '\n'))
}

// writeProjectErr maps the domain/db sentinel errors to HTTP statuses.
func writeProjectErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, projects.ErrInvalid), errors.Is(err, bundle.ErrInvalid), errors.Is(err, pipelines.ErrInvalid):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, db.ErrNotFound):
		http.Error(w, "project not found", http.StatusNotFound)
	case errors.Is(err, db.ErrConflict):
		http.Error(w, "a project with that slug already exists", http.StatusConflict)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
