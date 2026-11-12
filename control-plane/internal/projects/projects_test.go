package projects

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestValidateSlug(t *testing.T) {
	valid := []string{"a", "nyc-taxi", "sales2025", "a1-b2-c3", strings.Repeat("x", 48)}
	for _, s := range valid {
		if err := ValidateSlug(s); err != nil {
			t.Errorf("ValidateSlug(%q) = %v, want nil", s, err)
		}
	}
	invalid := []string{
		"", "-lead", "trail-", "Upper", "has space", "under_score", "dot.name",
		"double--hyphen", strings.Repeat("x", 49), "ünïcode", "a/b",
	}
	for _, s := range invalid {
		err := ValidateSlug(s)
		if err == nil {
			t.Errorf("ValidateSlug(%q) = nil, want error", s)
			continue
		}
		if !errors.Is(err, ErrInvalid) {
			t.Errorf("ValidateSlug(%q) error %v does not wrap ErrInvalid", s, err)
		}
	}
}

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"NYC Taxi":                "nyc-taxi",
		"  Sales   Q3 / 2025  ":   "sales-q3-2025",
		"already-a-slug":          "already-a-slug",
		"Ünïcödé Name":            "n-c-d-name",
		"___":                     "",
		"":                        "",
		"Trailing symbols!!!":     "trailing-symbols",
		strings.Repeat("ab ", 40): strings.TrimRight(strings.Repeat("ab-", 16), "-"),
		"Café de Paris":           "caf-de-paris",
	}
	for in, want := range cases {
		got := Slugify(in)
		if got != want {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
		if got != "" {
			if err := ValidateSlug(got); err != nil {
				t.Errorf("Slugify(%q) produced invalid slug %q: %v", in, got, err)
			}
		}
	}
}

func TestSlugifyLengthCap(t *testing.T) {
	got := Slugify(strings.Repeat("abcdefghij", 10))
	if len(got) != maxSlugLen {
		t.Fatalf("len = %d, want %d", len(got), maxSlugLen)
	}
	if err := ValidateSlug(got); err != nil {
		t.Fatal(err)
	}
}

func TestLooksLikeID(t *testing.T) {
	if !LooksLikeID("0f8fad5b-d9cb-469f-a165-70867728950e") {
		t.Error("lowercase uuid should look like an id")
	}
	if !LooksLikeID("0F8FAD5B-D9CB-469F-A165-70867728950E") {
		t.Error("uppercase uuid should look like an id")
	}
	for _, s := range []string{"nyc-taxi", "", "0f8fad5bd9cb469fa16570867728950e", "0f8fad5b-d9cb-469f-a165-70867728950"} {
		if LooksLikeID(s) {
			t.Errorf("%q should not look like an id", s)
		}
	}
}

func TestCreateInputNormalize(t *testing.T) {
	t.Run("derives slug from name", func(t *testing.T) {
		out, err := CreateInput{Name: "  Sales Analytics "}.Normalize()
		if err != nil {
			t.Fatal(err)
		}
		if out.Slug != "sales-analytics" || out.Name != "Sales Analytics" {
			t.Fatalf("got %+v", out)
		}
	})
	t.Run("keeps an explicit slug", func(t *testing.T) {
		out, err := CreateInput{Name: "Sales", Slug: "s1", Description: " d "}.Normalize()
		if err != nil {
			t.Fatal(err)
		}
		if out.Slug != "s1" || out.Description != "d" {
			t.Fatalf("got %+v", out)
		}
	})
	t.Run("rejects an invalid explicit slug", func(t *testing.T) {
		if _, err := (CreateInput{Name: "Sales", Slug: "Bad Slug"}).Normalize(); !errors.Is(err, ErrInvalid) {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("rejects an empty name", func(t *testing.T) {
		if _, err := (CreateInput{Name: "   "}).Normalize(); !errors.Is(err, ErrInvalid) {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("rejects a name that yields no slug", func(t *testing.T) {
		if _, err := (CreateInput{Name: "!!!"}).Normalize(); !errors.Is(err, ErrInvalid) {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("rejects an over-long description", func(t *testing.T) {
		if _, err := (CreateInput{Name: "x", Description: strings.Repeat("d", 501)}).Normalize(); !errors.Is(err, ErrInvalid) {
			t.Fatalf("got %v", err)
		}
	})
}

func TestUpdateInputValidate(t *testing.T) {
	str := func(s string) *string { return &s }
	raw := func(s string) *json.RawMessage { r := json.RawMessage(s); return &r }

	if err := (UpdateInput{}).Validate(); !errors.Is(err, ErrInvalid) {
		t.Errorf("empty update should be invalid, got %v", err)
	}
	if err := (UpdateInput{Name: str("New")}).Validate(); err != nil {
		t.Errorf("name-only update: %v", err)
	}
	if err := (UpdateInput{Name: str(" ")}).Validate(); !errors.Is(err, ErrInvalid) {
		t.Errorf("blank name should be invalid, got %v", err)
	}
	if err := (UpdateInput{AISettings: raw(`{"enabled":true}`)}).Validate(); err != nil {
		t.Errorf("valid aiSettings: %v", err)
	}
	if err := (UpdateInput{AISettings: raw(`{not json`)}).Validate(); !errors.Is(err, ErrInvalid) {
		t.Errorf("invalid aiSettings should be rejected, got %v", err)
	}
}

func TestHasFeature(t *testing.T) {
	p := Project{Features: json.RawMessage(`{"legacy_taxi": true, "other": false}`)}
	if !p.HasFeature(FeatureLegacyTaxi) {
		t.Error("legacy_taxi should be set")
	}
	if p.HasFeature("other") || p.HasFeature("missing") {
		t.Error("false/missing features should read as unset")
	}
	bad := Project{Features: json.RawMessage(`not json`)}
	if bad.HasFeature(FeatureLegacyTaxi) {
		t.Error("malformed features should read as unset")
	}
	none := Project{}
	if none.HasFeature(FeatureLegacyTaxi) {
		t.Error("nil features should read as unset")
	}
}

func TestProjectJSONShape(t *testing.T) {
	p := Project{ID: "id", Slug: "s", Name: "n", Features: json.RawMessage(`{}`), AISettings: json.RawMessage(`{}`)}
	b, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"id", "slug", "name", "description", "features", "aiSettings", "createdAt"} {
		if _, ok := m[key]; !ok {
			t.Errorf("missing json key %q", key)
		}
	}
	if _, ok := m["archivedAt"]; ok {
		t.Error("archivedAt should be omitted when nil")
	}
}
