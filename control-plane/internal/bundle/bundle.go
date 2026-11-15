// Package bundle is the project file format: a project's definition
// (URL datasets with their rules, pipelines and saved queries) as one JSON document that
// export writes and import reads. samples/nyc_taxi/project.json is one.
// Pure like internal/projects; internal/db stores an imported bundle in one
// transaction and internal/api serves both directions.
package bundle

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/AZURIIEAL/openscale/control-plane/internal/datasets"
	"github.com/AZURIIEAL/openscale/control-plane/internal/pipelines"
	"github.com/AZURIIEAL/openscale/control-plane/internal/projects"
	"github.com/AZURIIEAL/openscale/control-plane/internal/queries"
)

// Format names this version of the file; import refuses any other.
const Format = "openscale/project@1"

const (
	maxDatasets  = 100
	maxPipelines = 100
	maxQueries   = 200
)

// ErrInvalid wraps every reason a bundle is refused.
var ErrInvalid = errors.New("invalid project file")

// Dataset is a dataset fetched from a URL on import. Its data is not in the
// file: import queues a fetch, and the pipelines rebuild what derives from it.
type Dataset struct {
	Name  string          `json:"name"`
	Layer string          `json:"layer,omitempty"`
	URL   string          `json:"url"`
	Rules []datasets.Rule `json:"rules,omitempty"`
}

// Pipeline is a saved pipeline's definition.
type Pipeline struct {
	Name        string           `json:"name"`
	Description string           `json:"description,omitempty"`
	Steps       []pipelines.Step `json:"steps"`
}

// Query is a saved query; one with a chart is a dashboard tile.
type Query struct {
	Name  string         `json:"name"`
	SQL   string         `json:"sql"`
	Chart *queries.Chart `json:"chart,omitempty"`
}

// Bundle is the whole file.
type Bundle struct {
	Format    string               `json:"format"`
	Project   projects.CreateInput `json:"project"`
	Datasets  []Dataset            `json:"datasets"`
	Pipelines []Pipeline           `json:"pipelines"`
	Queries   []Query              `json:"queries,omitempty"`
}

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: "+format, append([]any{ErrInvalid}, args...)...)
}

// Parse decodes and validates a file, reusing each domain's own checks, and
// returns it normalized (trimmed, default layer, rules as stored). Whether
// each step's job type exists is the caller's check (CheckSteps needs the
// catalog).
func Parse(raw []byte) (Bundle, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var b Bundle
	if err := dec.Decode(&b); err != nil {
		return b, invalid("%v", err)
	}
	if b.Format != Format {
		return b, invalid("format must be %q", Format)
	}
	project, err := b.Project.Normalize()
	if err != nil {
		return b, invalid("project: %v", err)
	}
	b.Project = project
	if len(b.Datasets) > maxDatasets || len(b.Pipelines) > maxPipelines || len(b.Queries) > maxQueries {
		return b, invalid("at most %d datasets, %d pipelines and %d queries", maxDatasets, maxPipelines, maxQueries)
	}

	seen := map[string]bool{}
	for i := range b.Datasets {
		d := &b.Datasets[i]
		if err := datasets.ValidateName(d.Name); err != nil {
			return b, invalid("dataset %d: %v", i+1, err)
		}
		if seen[d.Name] {
			return b, invalid("dataset %s appears twice", d.Name)
		}
		seen[d.Name] = true
		if err := datasets.ValidateSourceURL(d.URL); err != nil {
			return b, invalid("dataset %s: %v", d.Name, err)
		}
		if d.Layer, err = datasets.NormalizeLayer(d.Layer); err != nil {
			return b, invalid("dataset %s: %v", d.Name, err)
		}
		// The columns aren't known until the fetch, so flag columns are
		// only checked against each other here.
		rules, _ := json.Marshal(d.Rules)
		if d.Rules, err = datasets.ParseRules(rules, nil); err != nil {
			return b, invalid("dataset %s: %v", d.Name, err)
		}
	}

	seen = map[string]bool{}
	for i := range b.Pipelines {
		p := &b.Pipelines[i]
		if err := pipelines.ValidateName(p.Name); err != nil {
			return b, invalid("pipeline %d: %v", i+1, err)
		}
		if seen[p.Name] {
			return b, invalid("pipeline %s appears twice", p.Name)
		}
		seen[p.Name] = true
		steps, _ := json.Marshal(p.Steps)
		if p.Steps, err = pipelines.ParseSteps(steps); err != nil {
			return b, invalid("pipeline %s: %v", p.Name, err)
		}
	}

	seen = map[string]bool{}
	for i := range b.Queries {
		q := &b.Queries[i]
		if seen[q.Name] {
			return b, invalid("query %s appears twice", q.Name)
		}
		seen[q.Name] = true
		if q.SQL, q.Chart, err = queries.Normalize(q.Name, q.SQL, q.Chart); err != nil {
			return b, invalid("query %q: %v", q.Name, err)
		}
	}
	return b, nil
}

// Export builds a project's file. Only URL datasets are included: an
// uploaded file's data isn't in the bundle, and derived datasets are rebuilt
// by running the pipelines.
//
// shortcut: uploaded datasets and rules on derived datasets are left out;
// add a lake archive (zip with the Parquet) when projects must move whole.
func Export(p projects.Project, all []datasets.Dataset, pls []pipelines.Pipeline, qs []queries.Query) (Bundle, error) {
	b := Bundle{
		Format:    Format,
		Project:   projects.CreateInput{Slug: p.Slug, Name: p.Name, Description: p.Description},
		Datasets:  []Dataset{},
		Pipelines: []Pipeline{},
	}
	for _, d := range all {
		if d.Source.Kind != datasets.SourceURL {
			continue
		}
		var rules []datasets.Rule
		if err := json.Unmarshal(d.Rules, &rules); err != nil {
			return b, fmt.Errorf("bundle: dataset %s: bad rules json: %w", d.Name, err)
		}
		b.Datasets = append(b.Datasets, Dataset{Name: d.Name, Layer: d.Layer, URL: d.Source.URL, Rules: rules})
	}
	for _, p := range pls {
		b.Pipelines = append(b.Pipelines, Pipeline{Name: p.Name, Description: p.Description, Steps: p.Steps})
	}
	for _, q := range qs {
		b.Queries = append(b.Queries, Query{Name: q.Name, SQL: q.SQL, Chart: q.Chart})
	}
	return b, nil
}
