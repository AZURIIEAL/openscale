CREATE TABLE IF NOT EXISTS control_plane.appearance_settings (
    id             BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    theme_override TEXT NOT NULL DEFAULT 'light',
    visual_mode    TEXT NOT NULL DEFAULT 'flat',
    accent_id      TEXT NOT NULL DEFAULT 'teal',
    shadow_scale   DOUBLE PRECISION NOT NULL DEFAULT 1,
    ui_scale       DOUBLE PRECISION NOT NULL DEFAULT 1,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single global row (id is constrained to TRUE) -- this tool has no
-- per-user auth, so appearance settings aren't scoped to a user.
INSERT INTO control_plane.appearance_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
