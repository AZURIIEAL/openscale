package db

import (
	"context"
	"fmt"
)

// AppearanceSettings is the single global row of UI appearance preferences
// (interface style, theme, accent color, shadow/font scale -- see the
// frontend's app/theme-store.ts). This tool has no per-user auth, so
// there's exactly one row, not one per user.
type AppearanceSettings struct {
	ThemeOverride string  `json:"themeOverride"`
	VisualMode    string  `json:"visualMode"`
	AccentID      string  `json:"accentId"`
	ShadowScale   float64 `json:"shadowScale"`
	UIScale       float64 `json:"uiScale"`
}

// GetAppearanceSettings reads the singleton row seeded by migration 0004,
// so it always exists once migrations have run.
func (d *DB) GetAppearanceSettings(ctx context.Context) (AppearanceSettings, error) {
	var s AppearanceSettings
	err := d.pool.QueryRow(ctx,
		`SELECT theme_override, visual_mode, accent_id, shadow_scale, ui_scale
		 FROM control_plane.appearance_settings WHERE id = TRUE`,
	).Scan(&s.ThemeOverride, &s.VisualMode, &s.AccentID, &s.ShadowScale, &s.UIScale)
	if err != nil {
		return AppearanceSettings{}, fmt.Errorf("db: get appearance settings: %w", err)
	}
	return s, nil
}

// UpsertAppearanceSettings overwrites the singleton row with the frontend's
// full theme-store shape -- always a whole-row replace, never a partial
// patch, since the client always has (and sends) the complete state.
func (d *DB) UpsertAppearanceSettings(ctx context.Context, s AppearanceSettings) (AppearanceSettings, error) {
	_, err := d.pool.Exec(ctx,
		`INSERT INTO control_plane.appearance_settings (id, theme_override, visual_mode, accent_id, shadow_scale, ui_scale, updated_at)
		 VALUES (TRUE, $1, $2, $3, $4, $5, now())
		 ON CONFLICT (id) DO UPDATE SET
		   theme_override = EXCLUDED.theme_override,
		   visual_mode    = EXCLUDED.visual_mode,
		   accent_id      = EXCLUDED.accent_id,
		   shadow_scale   = EXCLUDED.shadow_scale,
		   ui_scale       = EXCLUDED.ui_scale,
		   updated_at     = now()`,
		s.ThemeOverride, s.VisualMode, s.AccentID, s.ShadowScale, s.UIScale,
	)
	if err != nil {
		return AppearanceSettings{}, fmt.Errorf("db: upsert appearance settings: %w", err)
	}
	return s, nil
}
