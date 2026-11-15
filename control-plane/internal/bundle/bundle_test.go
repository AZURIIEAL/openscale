package bundle

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/AZURIIEAL/openscale/control-plane/internal/datasets"
	"github.com/AZURIIEAL/openscale/control-plane/internal/pipelines"
	"github.com/AZURIIEAL/openscale/control-plane/internal/projects"
	"github.com/AZURIIEAL/openscale/control-plane/internal/queries"
)

const valid = `{
  "format": "openscale/project@1",
  "project": {"name": " Demo ", "description": "d"},
  "datasets": [{"name": "trips", "url": "https://example.com/t.parquet",
                "rules": [{"id": "R1", "tier": "reject", "when": " x < 0 "}]}],
  "pipelines": [{"name": "clean", "steps": [{"jobType": "validate", "params": {"dataset": "trips", "output": "trips_clean"}}]}]
}`

func TestParse(t *testing.T) {
	b, err := Parse([]byte(valid))
	if err != nil {
		t.Fatal(err)
	}
	if b.Project.Slug != "demo" || b.Project.Name != "Demo" {
		t.Errorf("project not normalized: %+v", b.Project)
	}
	if b.Datasets[0].Layer != datasets.LayerBronze || b.Datasets[0].Rules[0].When != "x < 0" {
		t.Errorf("dataset not normalized: %+v", b.Datasets[0])
	}
	if b.Pipelines[0].Steps[0].JobType != "validate" {
		t.Errorf("steps: %+v", b.Pipelines[0].Steps)
	}
}

func TestParseRefuses(t *testing.T) {
	cases := map[string]func(s string) string{
		"format":        func(s string) string { return strings.Replace(s, "@1", "@9", 1) },
		"unknown field": func(s string) string { return strings.Replace(s, `"format"`, `"extra": 1, "format"`, 1) },
		"bad url":       func(s string) string { return strings.Replace(s, "https://example.com", "http://localhost", 1) },
		"bad rule tier": func(s string) string { return strings.Replace(s, `"reject"`, `"drop"`, 1) },
		"dup dataset": func(s string) string {
			return strings.Replace(s, `"datasets": [`, `"datasets": [{"name": "trips", "url": "https://e.com/a.csv"}, `, 1)
		},
		"no steps": func(s string) string {
			return strings.Replace(s, `"steps": [{"jobType": "validate", "params": {"dataset": "trips", "output": "trips_clean"}}]`, `"steps": []`, 1)
		},
		"bad query": func(s string) string {
			return strings.Replace(s, `"pipelines": [`, `"queries": [{"name": "q", "sql": "drop table trips"}], "pipelines": [`, 1)
		},
		"bad name": func(s string) string { return strings.Replace(s, `"clean"`, `"Clean!"`, 1) },
	}
	for name, mutate := range cases {
		in := mutate(valid)
		if in == valid {
			t.Fatalf("%s: mutation did not apply", name)
		}
		if _, err := Parse([]byte(in)); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: want ErrInvalid, got %v", name, err)
		}
	}
}

func TestExportRoundTrip(t *testing.T) {
	rules, _ := json.Marshal([]datasets.Rule{{ID: "R1", Tier: "reject", When: "x < 0"}})
	all := []datasets.Dataset{
		{Name: "trips", Layer: "bronze", Source: datasets.Source{Kind: datasets.SourceURL, URL: "https://example.com/t.parquet"}, Rules: rules},
		{Name: "upload", Layer: "bronze", Source: datasets.Source{Kind: datasets.SourceUpload}, Rules: json.RawMessage("[]")},
	}
	pls := []pipelines.Pipeline{{Name: "clean", Steps: []pipelines.Step{{JobType: "validate", Params: map[string]any{"dataset": "trips"}}}}}
	qs := []queries.Query{{Name: "n", SQL: "select count(*) as n from trips", Chart: &queries.Chart{Type: "number", Y: "n"}}}
	b, err := Export(projects.Project{Slug: "demo", Name: "Demo"}, all, pls, qs)
	if err != nil {
		t.Fatal(err)
	}
	if len(b.Datasets) != 1 || len(b.Queries) != 1 {
		t.Errorf("uploaded datasets should be left out: %+v", b.Datasets)
	}
	raw, _ := json.Marshal(b)
	if _, err := Parse(raw); err != nil {
		t.Errorf("an export must import: %v", err)
	}
}

// The shipped sample must always parse.
func TestSampleParses(t *testing.T) {
	raw, err := os.ReadFile("../../../samples/nyc_taxi/project.json")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Parse(raw); err != nil {
		t.Fatal(err)
	}
}
