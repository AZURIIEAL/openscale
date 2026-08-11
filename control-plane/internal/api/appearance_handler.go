package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
)

// AppearanceHandler serves the Connections screen's persisted appearance
// settings (interface style, theme, accent color, shadow/font scale) -- a
// single global row, since this tool has no per-user auth.
type AppearanceHandler struct {
	db *db.DB
}

func NewAppearanceHandler(database *db.DB) *AppearanceHandler {
	return &AppearanceHandler{db: database}
}

// Get handles GET /api/appearance-settings.
func (h *AppearanceHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	settings, err := h.db.GetAppearanceSettings(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(settings)
}

// Update handles PUT /api/appearance-settings, replacing the whole
// settings row -- the frontend always sends its complete theme-store
// shape, never a partial patch.
func (h *AppearanceHandler) Update(w http.ResponseWriter, r *http.Request) {
	var settings db.AppearanceSettings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	saved, err := h.db.UpsertAppearanceSettings(ctx, settings)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(saved)
}
