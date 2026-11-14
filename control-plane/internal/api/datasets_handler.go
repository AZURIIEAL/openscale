package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/AZURIIEAL/openscale/control-plane/internal/datasets"
	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
	"github.com/AZURIIEAL/openscale/control-plane/internal/lake"
	"github.com/AZURIIEAL/openscale/control-plane/internal/queryengine"
)

// DatasetsHandler serves a project's datasets: list/get, create from an
// uploaded file or a URL, add a file, delete, and the preview/profile
// endpoints that go through the query engine.
type DatasetsHandler struct {
	db             *db.DB
	lake           *lake.Client
	engine         *queryengine.Client
	dispatcher     *Dispatcher
	maxUploadBytes int64
}

func NewDatasetsHandler(database *db.DB, lakeClient *lake.Client, engine *queryengine.Client, dispatcher *Dispatcher, maxUploadBytes int64) *DatasetsHandler {
	return &DatasetsHandler{db: database, lake: lakeClient, engine: engine, dispatcher: dispatcher, maxUploadBytes: maxUploadBytes}
}

// Job types the worker registers for datasets. "dataset_" prefixed so they
// sit beside the legacy taxi "ingest" until Phase 4 retires it.
const (
	jobDatasetFetch  = "dataset_fetch"
	jobDatasetIngest = "dataset_ingest"
)

// List handles GET /api/projects/{p}/datasets.
func (h *DatasetsHandler) List(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	list, err := h.db.ListDatasets(ctx, project.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// Get handles GET /api/projects/{p}/datasets/{name}.
func (h *DatasetsHandler) Get(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.load(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, ds)
}

// Create handles POST /api/projects/{p}/datasets. Two bodies are accepted:
//
//   - multipart/form-data with fields `name` (optional), `layer` (optional)
//     and `file`: the file streams straight to the lake, then an ingest
//     job is queued.
//   - application/json {"name", "layer", "url"}: the row is created and a
//     fetch job (download + ingest) is queued.
func (h *DatasetsHandler) Create(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))

	switch mediaType {
	case "multipart/form-data":
		h.createFromUpload(w, r, project.ID, "")
	case "application/json", "":
		h.createFromURL(w, r, project.ID)
	default:
		http.Error(w, "expected multipart/form-data (upload) or application/json (url)", http.StatusUnsupportedMediaType)
	}
}

// AddFile handles POST /api/projects/{p}/datasets/{name}/files: another raw
// file for an existing dataset (next month's export, say). The dataset is
// re-ingested so data/ and the stored schema cover every file.
func (h *DatasetsHandler) AddFile(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.load(w, r)
	if !ok {
		return
	}
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType != "multipart/form-data" {
		http.Error(w, "expected multipart/form-data", http.StatusUnsupportedMediaType)
		return
	}
	h.createFromUpload(w, r, ds.ProjectID, ds.Name)
}

func (h *DatasetsHandler) createFromURL(w http.ResponseWriter, r *http.Request, projectID string) {
	var in datasets.CreateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.URL = strings.TrimSpace(in.URL)
	if err := datasets.ValidateSourceURL(in.URL); err != nil {
		writeDatasetErr(w, err)
		return
	}
	if in.Name == "" {
		in.Name = datasets.NameFromFilename(datasets.FilenameFromURL(in.URL))
	}
	if err := datasets.ValidateName(in.Name); err != nil {
		writeDatasetErr(w, err)
		return
	}
	layer, err := datasets.NormalizeLayer(in.Layer)
	if err != nil {
		writeDatasetErr(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	ds, err := h.db.CreateDataset(ctx, projectID, in.Name, layer, datasets.Source{Kind: datasets.SourceURL, URL: in.URL})
	if err != nil {
		writeDatasetErr(w, err)
		return
	}
	h.queueJob(ctx, w, ds, jobDatasetFetch, map[string]any{"dataset_id": ds.ID, "dataset_name": ds.Name, "url": in.URL})
}

// createFromUpload streams the multipart `file` part to the lake. It reads
// the request with MultipartReader (not ParseMultipartForm, which buffers
// the file to memory/disk first), capped by MaxBytesReader. Text fields
// must precede the file part, which every browser FormData does.
//
// existingName is "" for a new dataset, or the dataset to add a file to.
func (h *DatasetsHandler) createFromUpload(w http.ResponseWriter, r *http.Request, projectID, existingName string) {
	r.Body = http.MaxBytesReader(w, r.Body, h.maxUploadBytes+1<<20) // + 1 MiB for the multipart framing
	mr, err := r.MultipartReader()
	if err != nil {
		http.Error(w, "invalid multipart body: "+err.Error(), http.StatusBadRequest)
		return
	}

	fields := map[string]string{}
	var ds datasets.Dataset
	var landed bool

	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			http.Error(w, "invalid multipart body: "+err.Error(), http.StatusBadRequest)
			return
		}

		if part.FormName() != "file" {
			val, _ := io.ReadAll(io.LimitReader(part, 4096))
			fields[part.FormName()] = strings.TrimSpace(string(val))
			continue
		}

		if landed {
			http.Error(w, "only one file per request", http.StatusBadRequest)
			return
		}
		filename := part.FileName()
		if !datasets.IsSupportedFilename(filename) {
			http.Error(w, "unsupported file type; use CSV, TSV, Parquet or JSON (optionally gzipped)", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
		defer cancel()

		if existingName != "" {
			ds, err = h.db.GetDataset(ctx, projectID, existingName)
		} else {
			name := fields["name"]
			if name == "" {
				name = datasets.NameFromFilename(filename)
			}
			if err = datasets.ValidateName(name); err != nil {
				writeDatasetErr(w, err)
				return
			}
			var layer string
			if layer, err = datasets.NormalizeLayer(fields["layer"]); err != nil {
				writeDatasetErr(w, err)
				return
			}
			ds, err = h.db.CreateDataset(ctx, projectID, name, layer, datasets.Source{Kind: datasets.SourceUpload, Filename: filename})
		}
		if err != nil {
			writeDatasetErr(w, err)
			return
		}

		key := datasets.RawObjectKey(projectID, ds.ID, filename)
		if _, err := h.lake.PutObject(ctx, key, part, -1, part.Header.Get("Content-Type")); err != nil {
			reason := "upload to lake failed: " + err.Error()
			_ = h.db.MarkDatasetFailed(ctx, ds.ID, reason)
			status := http.StatusBadGateway
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				status = http.StatusRequestEntityTooLarge
				reason = fmt.Sprintf("file exceeds the %d byte upload limit", h.maxUploadBytes)
			}
			http.Error(w, reason, status)
			return
		}
		landed = true

		if existingName != "" {
			if err := h.db.MarkDatasetPending(ctx, ds.ID); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
		h.queueJob(ctx, w, ds, jobDatasetIngest, map[string]any{"dataset_id": ds.ID, "dataset_name": ds.Name})
		return
	}

	http.Error(w, "multipart body has no `file` part", http.StatusBadRequest)
}

// queueJob dispatches the worker job that completes the dataset and
// answers 202 with the dataset and the run. A dispatch failure marks the
// dataset failed so it never sits at pending forever.
func (h *DatasetsHandler) queueJob(ctx context.Context, w http.ResponseWriter, ds datasets.Dataset, jobType string, params map[string]any) {
	payload, _ := json.Marshal(params)
	run, err := h.dispatcher.Dispatch(ctx, ds.ProjectID, jobType, payload)
	if err != nil {
		_ = h.db.MarkDatasetFailed(ctx, ds.ID, "could not queue "+jobType+": "+err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if run.Error != nil {
		_ = h.db.MarkDatasetFailed(ctx, ds.ID, *run.Error)
		ds.Status = datasets.StatusFailed
		ds.Error = run.Error
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"dataset": ds, "run": run})
}

// Delete handles DELETE /api/projects/{p}/datasets/{name}: the row and
// every lake object under the dataset's prefix.
func (h *DatasetsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.load(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	if err := h.lake.DeletePrefix(ctx, datasets.Prefix(ds.ProjectID, ds.ID)); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if err := h.db.DeleteDataset(ctx, ds.ID); err != nil {
		writeDatasetErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Preview handles GET /api/projects/{p}/datasets/{name}/preview?limit=20.
func (h *DatasetsHandler) Preview(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.load(w, r)
	if !ok {
		return
	}
	if ds.Status != datasets.StatusReady {
		writeJSON(w, http.StatusOK, queryengine.Result{Error: "dataset is not ready yet"})
		return
	}
	limit := 20
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	res, err := h.engine.Preview(ctx, ds.ProjectID, DatasetRef(ds), limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// Profile handles GET /api/projects/{p}/datasets/{name}/profile. The
// stored profile (written by ingest) is served when present; otherwise it
// is computed live.
func (h *DatasetsHandler) Profile(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.load(w, r)
	if !ok {
		return
	}
	if len(ds.Profile) > 0 && r.URL.Query().Get("refresh") == "" {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(ds.Profile)
		return
	}
	if ds.Status != datasets.StatusReady {
		writeJSON(w, http.StatusOK, queryengine.Profile{Error: "dataset is not ready yet"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	prof, err := h.engine.ProfileDataset(ctx, ds.ProjectID, DatasetRef(ds))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, prof)
}

// DatasetRef builds the query engine's view of a dataset: its name and the
// Parquet glob under data/.
func DatasetRef(ds datasets.Dataset) queryengine.DatasetRef {
	return queryengine.DatasetRef{
		Name: ds.Name,
		Path: "s3://" + lake.Bucket + "/" + datasets.DataPrefix(ds.ProjectID, ds.ID) + "*.parquet",
	}
}

func (h *DatasetsHandler) load(w http.ResponseWriter, r *http.Request) (datasets.Dataset, bool) {
	project, _ := ProjectFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	ds, err := h.db.GetDataset(ctx, project.ID, chi.URLParam(r, "name"))
	if err != nil {
		writeDatasetErr(w, err)
		return datasets.Dataset{}, false
	}
	return ds, true
}

func writeDatasetErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, datasets.ErrInvalid):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, db.ErrNotFound):
		http.Error(w, "dataset not found", http.StatusNotFound)
	case errors.Is(err, db.ErrConflict):
		http.Error(w, "a dataset with that name already exists in this project", http.StatusConflict)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
