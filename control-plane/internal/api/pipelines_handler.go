package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
	"github.com/AZURIIEAL/openscale/control-plane/internal/pipelines"
	"github.com/AZURIIEAL/openscale/control-plane/internal/redis"
)

// maxPipelineBody bounds a pipeline definition: MaxSteps steps, each with a
// few params (a SQL transform's query is the largest).
const maxPipelineBody = 1 << 20

// PipelinesHandler serves a project's saved pipelines and their runs. The
// Orchestrator does the running; this only records what to run.
type PipelinesHandler struct {
	db           *db.DB
	redis        *redis.Client
	orchestrator *Orchestrator
}

func NewPipelinesHandler(database *db.DB, redisClient *redis.Client, orchestrator *Orchestrator) *PipelinesHandler {
	return &PipelinesHandler{db: database, redis: redisClient, orchestrator: orchestrator}
}

type pipelineBody struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Steps       json.RawMessage `json:"steps"`
}

// readPipeline decodes and validates a pipeline definition against the job
// catalog and the project's features.
func (h *PipelinesHandler) readPipeline(w http.ResponseWriter, r *http.Request) (pipelineBody, []pipelines.Step, error) {
	var body pipelineBody
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxPipelineBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		return body, nil, fmt.Errorf("%w: expected {\"name\", \"description\", \"steps\": [...]}", pipelines.ErrInvalid)
	}
	steps, err := pipelines.ParseSteps(body.Steps)
	if err != nil {
		return body, nil, err
	}
	return body, steps, h.checkSteps(r.Context(), steps)
}

func (h *PipelinesHandler) checkSteps(ctx context.Context, steps []pipelines.Step) error {
	project, _ := ProjectFromContext(ctx)
	lookup := func(jobType string) (jobs.Definition, error) {
		def, err := h.db.GetJobDefinition(ctx, jobType)
		if errors.Is(err, db.ErrNotFound) {
			return def, fmt.Errorf("unknown job type")
		}
		return def, err
	}
	return pipelines.CheckSteps(steps, lookup, project.HasFeature)
}

// List handles GET /api/projects/{p}/pipelines.
func (h *PipelinesHandler) List(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	list, err := h.db.ListPipelines(r.Context(), project.ID)
	if err != nil {
		writePipelineErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// Create handles POST /api/projects/{p}/pipelines.
func (h *PipelinesHandler) Create(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	body, steps, err := h.readPipeline(w, r)
	if err == nil {
		err = pipelines.ValidateName(body.Name)
	}
	if err != nil {
		writePipelineErr(w, err)
		return
	}
	p, err := h.db.CreatePipeline(r.Context(), project.ID, body.Name, strings.TrimSpace(body.Description), steps)
	if err != nil {
		writePipelineErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

// Update handles PUT /api/projects/{p}/pipelines/{name}. The name in the
// body, if any, must match: renaming isn't supported.
func (h *PipelinesHandler) Update(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	name := chi.URLParam(r, "name")
	body, steps, err := h.readPipeline(w, r)
	if err == nil && body.Name != "" && body.Name != name {
		err = fmt.Errorf("%w: pipelines can't be renamed", pipelines.ErrInvalid)
	}
	if err != nil {
		writePipelineErr(w, err)
		return
	}
	p, err := h.db.UpdatePipeline(r.Context(), project.ID, name, strings.TrimSpace(body.Description), steps)
	if err != nil {
		writePipelineErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// Delete handles DELETE /api/projects/{p}/pipelines/{name}. Runs already
// going carry on with their own copy of the steps.
func (h *PipelinesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	if err := h.db.DeletePipeline(r.Context(), project.ID, chi.URLParam(r, "name")); err != nil {
		writePipelineErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Run handles POST /api/projects/{p}/pipelines/{name}/run. An optional
// {"params": {...}} replaces the first step's saved params for this run
// (the taxi pipeline's month range).
//
// shortcut: only the first step takes run-time params; give every step a
// slot ({"steps": [{params}...]}) when a pipeline needs more than one.
func (h *PipelinesHandler) Run(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	var body struct {
		Params map[string]any `json:"params"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxParamsBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		writePipelineErr(w, fmt.Errorf("%w: expected {\"params\": {...}} or no body", pipelines.ErrInvalid))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	p, err := h.db.GetPipeline(ctx, project.ID, chi.URLParam(r, "name"))
	if err != nil {
		writePipelineErr(w, err)
		return
	}
	steps := p.Steps
	if body.Params != nil {
		steps = append([]pipelines.Step{{JobType: steps[0].JobType, Params: body.Params}}, steps[1:]...)
	}
	// The catalog may have changed since the pipeline was saved.
	if err := h.checkSteps(ctx, steps); err != nil {
		writePipelineErr(w, err)
		return
	}
	run, err := h.db.StartPipelineRun(ctx, p, steps)
	if err != nil {
		writePipelineErr(w, err)
		return
	}
	h.orchestrator.Wake()
	writeJSON(w, http.StatusAccepted, run)
}

// ListRuns handles GET /api/projects/{p}/pipeline-runs?limit=20.
func (h *PipelinesHandler) ListRuns(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	limit := 20
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 && n <= 100 {
		limit = n
	}
	runs, err := h.db.ListPipelineRuns(r.Context(), project.ID, limit)
	if err != nil {
		writePipelineErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, runs)
}

// GetRun handles GET /api/projects/{p}/pipeline-runs/{id}.
func (h *PipelinesHandler) GetRun(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	run, err := h.db.GetPipelineRun(r.Context(), project.ID, chi.URLParam(r, "id"))
	if err != nil {
		writePipelineErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, run)
}

// CancelRun handles POST /api/projects/{p}/pipeline-runs/{id}/cancel: the
// run stops (no further step is queued) and its current job is cancelled.
// Cancelling a finished run changes nothing and returns it as it is.
func (h *PipelinesHandler) CancelRun(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	run, err := h.db.GetPipelineRun(ctx, project.ID, chi.URLParam(r, "id"))
	if err != nil {
		writePipelineErr(w, err)
		return
	}
	msg := "Cancelled by user"
	if _, err := h.db.FinishPipelineRun(ctx, run.ID, jobs.StatusCancelled, &msg); err != nil {
		writePipelineErr(w, err)
		return
	}
	cancelled, err := h.db.CancelPipelineJobs(ctx, run.ID)
	if err == nil {
		err = signalCancelled(ctx, h.redis, cancelled)
	}
	if err != nil {
		http.Error(w, "cancelled the pipeline run, but not its current job: "+err.Error(), http.StatusBadGateway)
		return
	}
	if run, err = h.db.GetPipelineRun(ctx, project.ID, run.ID); err != nil {
		writePipelineErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, run)
}

// writePipelineErr maps the pipeline domain's errors to HTTP statuses.
func writePipelineErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, pipelines.ErrInvalid):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, db.ErrNotFound):
		http.Error(w, "pipeline not found", http.StatusNotFound)
	case errors.Is(err, db.ErrConflict):
		http.Error(w, "a pipeline with that name already exists in this project", http.StatusConflict)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
