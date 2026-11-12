// Package projects holds the project domain: the plain type and the pure
// rules for naming projects. No framework or IO dependency, mirroring
// internal/jobs and internal/health -- internal/db translates into and out
// of these types, internal/api serves them.
//
// A project is the top-level namespace of OpenScale: datasets, runs,
// queries and dashboards all belong to exactly one. With no authentication
// yet it is an organisational boundary, not a security one.
package projects

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Project is one workspace.
type Project struct {
	ID          string          `json:"id"`
	Slug        string          `json:"slug"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Features    json.RawMessage `json:"features"`
	AISettings  json.RawMessage `json:"aiSettings"`
	CreatedAt   time.Time       `json:"createdAt"`
	ArchivedAt  *time.Time      `json:"archivedAt,omitempty"`
}

// SampleSlug is the slug of the sample project the first migration creates
// for the pre-existing taxi pipeline, so old job history has a home.
const SampleSlug = "nyc-taxi"

// FeatureLegacyTaxi marks the one project whose Pipelines, Dashboards and
// Streaming screens still show the hardcoded taxi stages. It goes away once
// those stages become ordinary pipeline rows.
const FeatureLegacyTaxi = "legacy_taxi"

const (
	maxSlugLen = 48
	maxNameLen = 80
	maxDescLen = 500
)

// slugPattern: lowercase letters, digits and single hyphens, starting and
// ending with a letter or digit. The slug appears in URLs and lake paths,
// so it is deliberately strict.
var slugPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`)

// uuidPattern is the loose shape check used to tell a project id from a
// slug in a URL segment; Postgres does the real validation.
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// ErrInvalid is wrapped by every validation error so handlers can map it
// to a 400 without string matching.
var ErrInvalid = errors.New("invalid project")

// ValidateSlug checks a user-supplied slug.
func ValidateSlug(slug string) error {
	switch {
	case slug == "":
		return fmt.Errorf("%w: slug is required", ErrInvalid)
	case len(slug) > maxSlugLen:
		return fmt.Errorf("%w: slug must be at most %d characters", ErrInvalid, maxSlugLen)
	case !slugPattern.MatchString(slug):
		return fmt.Errorf("%w: slug may contain only lowercase letters, digits and hyphens", ErrInvalid)
	case strings.Contains(slug, "--"):
		return fmt.Errorf("%w: slug may not contain consecutive hyphens", ErrInvalid)
	}
	return nil
}

// ValidateName checks a display name.
func ValidateName(name string) error {
	trimmed := strings.TrimSpace(name)
	switch {
	case trimmed == "":
		return fmt.Errorf("%w: name is required", ErrInvalid)
	case len(trimmed) > maxNameLen:
		return fmt.Errorf("%w: name must be at most %d characters", ErrInvalid, maxNameLen)
	}
	return nil
}

// ValidateDescription checks an optional description.
func ValidateDescription(desc string) error {
	if len(desc) > maxDescLen {
		return fmt.Errorf("%w: description must be at most %d characters", ErrInvalid, maxDescLen)
	}
	return nil
}

// Slugify derives a slug from a display name: lowercase, non-alphanumerics
// collapsed to single hyphens, trimmed to length. It returns "" when nothing
// usable is left (a name made only of symbols), so callers can ask for an
// explicit slug instead.
func Slugify(name string) string {
	var b strings.Builder
	lastHyphen := true // suppresses a leading hyphen
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastHyphen = false
		default:
			if !lastHyphen {
				b.WriteByte('-')
				lastHyphen = true
			}
		}
	}
	slug := strings.TrimRight(b.String(), "-")
	if len(slug) > maxSlugLen {
		slug = strings.TrimRight(slug[:maxSlugLen], "-")
	}
	return slug
}

// LooksLikeID reports whether a URL segment has the shape of a UUID, so a
// route can accept either `/projects/{id}` or `/projects/{slug}`.
func LooksLikeID(segment string) bool {
	return uuidPattern.MatchString(segment)
}

// CreateInput is what a caller supplies to create a project. Slug is
// optional; it is derived from Name when empty.
type CreateInput struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// Normalize fills in the slug and trims whitespace, then validates. It
// returns the cleaned input so the caller stores exactly what was checked.
func (in CreateInput) Normalize() (CreateInput, error) {
	out := CreateInput{
		Slug:        strings.TrimSpace(in.Slug),
		Name:        strings.TrimSpace(in.Name),
		Description: strings.TrimSpace(in.Description),
	}
	if err := ValidateName(out.Name); err != nil {
		return CreateInput{}, err
	}
	if out.Slug == "" {
		out.Slug = Slugify(out.Name)
		if out.Slug == "" {
			return CreateInput{}, fmt.Errorf("%w: could not derive a slug from the name; supply one", ErrInvalid)
		}
	}
	if err := ValidateSlug(out.Slug); err != nil {
		return CreateInput{}, err
	}
	if err := ValidateDescription(out.Description); err != nil {
		return CreateInput{}, err
	}
	return out, nil
}

// UpdateInput carries a partial update: nil fields are left unchanged.
type UpdateInput struct {
	Name        *string          `json:"name,omitempty"`
	Description *string          `json:"description,omitempty"`
	AISettings  *json.RawMessage `json:"aiSettings,omitempty"`
}

// Validate checks whichever fields are present.
func (in UpdateInput) Validate() error {
	if in.Name != nil {
		if err := ValidateName(*in.Name); err != nil {
			return err
		}
	}
	if in.Description != nil {
		if err := ValidateDescription(*in.Description); err != nil {
			return err
		}
	}
	if in.AISettings != nil && !json.Valid(*in.AISettings) {
		return fmt.Errorf("%w: aiSettings must be valid JSON", ErrInvalid)
	}
	if in.Name == nil && in.Description == nil && in.AISettings == nil {
		return fmt.Errorf("%w: nothing to update", ErrInvalid)
	}
	return nil
}

// HasFeature reports whether the project's features blob has key set to
// true. Malformed JSON reads as "no features" rather than an error, since a
// bad flag should never take a screen down.
func (p Project) HasFeature(key string) bool {
	var features map[string]bool
	if err := json.Unmarshal(p.Features, &features); err != nil {
		return false
	}
	return features[key]
}
