package jobs

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/AZURIIEAL/openscale/control-plane/internal/datasets"
)

// ErrInvalidParams wraps every reason a run request's params are refused;
// the run handler maps it to 400.
var ErrInvalidParams = errors.New("invalid job params")

// ParamSpec is one field of a job's params schema, exactly as the worker
// publishes it from its @job registry (worker/registry.py's Param). Min and
// Max are numbers for number/integer fields and "YYYY-MM-DD"/"YYYY-MM"
// strings for date/month fields. Gte names an earlier field this one must
// be greater than or equal to.
type ParamSpec struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Label       string   `json:"label"`
	Description string   `json:"description,omitempty"`
	Required    bool     `json:"required,omitempty"`
	Default     any      `json:"default,omitempty"`
	Options     []string `json:"options,omitempty"`
	Min         any      `json:"min,omitempty"`
	Max         any      `json:"max,omitempty"`
	Gte         string   `json:"gte,omitempty"`
}

// Definition is one job type from control_plane.job_definitions: the job
// catalog the worker publishes and the frontend renders run forms from.
type Definition struct {
	Type         string      `json:"type"`
	Label        string      `json:"label"`
	Description  string      `json:"description"`
	Stage        string      `json:"stage,omitempty"`
	ParamsSchema []ParamSpec `json:"paramsSchema"`
	// Listed is false for jobs another screen or API queues (replay, reset,
	// dataset jobs); they're kept out of the Pipelines run list.
	Listed bool `json:"listed"`
}

const (
	dateLayout  = "2006-01-02"
	monthLayout = "2006-01"
)

// ParseParams decodes a run request body. An empty body means no params;
// anything other than a JSON object is refused.
func ParseParams(body []byte) (map[string]any, error) {
	if len(bytes.TrimSpace(body)) == 0 {
		return map[string]any{}, nil
	}
	var params map[string]any
	if err := json.Unmarshal(body, &params); err != nil || params == nil {
		return nil, fmt.Errorf("%w: the body must be a JSON object", ErrInvalidParams)
	}
	return params, nil
}

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: "+format, append([]any{ErrInvalidParams}, args...)...)
}

// ValidateParams checks params against the definition's schema: no unknown
// keys, required fields present, every value of its declared type and
// within its bounds, and gte pairs in order. Errors name the field and wrap
// ErrInvalidParams.
func (d Definition) ValidateParams(params map[string]any) error {
	specs := make(map[string]ParamSpec, len(d.ParamsSchema))
	for _, p := range d.ParamsSchema {
		specs[p.Name] = p
	}

	names := make([]string, 0, len(params))
	for name := range params {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if _, ok := specs[name]; !ok {
			return invalid("unknown parameter %q for job %q", name, d.Type)
		}
	}

	for _, p := range d.ParamsSchema {
		v, present := params[p.Name]
		if !present || v == nil || v == "" {
			if p.Required {
				return invalid("%s is required", p.Name)
			}
			continue
		}
		if err := checkValue(p, v); err != nil {
			return err
		}
	}

	for _, p := range d.ParamsSchema {
		if p.Gte == "" {
			continue
		}
		a, b := params[p.Name], params[p.Gte]
		if a == nil || a == "" || b == nil || b == "" {
			continue
		}
		if less(a, b) {
			return invalid("%s must be on or after %s", p.Name, p.Gte)
		}
	}
	return nil
}

func checkValue(p ParamSpec, v any) error {
	switch p.Type {
	case "string":
		if _, ok := v.(string); !ok {
			return invalid("%s must be a string", p.Name)
		}
	case "boolean":
		if _, ok := v.(bool); !ok {
			return invalid("%s must be true or false", p.Name)
		}
	case "number", "integer":
		n, ok := v.(float64)
		if !ok {
			return invalid("%s must be a number", p.Name)
		}
		if p.Type == "integer" && n != math.Trunc(n) {
			return invalid("%s must be a whole number", p.Name)
		}
		if lo, ok := p.Min.(float64); ok && n < lo {
			return invalid("%s must be at least %v", p.Name, lo)
		}
		if hi, ok := p.Max.(float64); ok && n > hi {
			return invalid("%s must be at most %v", p.Name, hi)
		}
	case "enum":
		s, _ := v.(string)
		for _, o := range p.Options {
			if s == o {
				return nil
			}
		}
		return invalid("%s must be one of %v", p.Name, p.Options)
	case "date", "month":
		layout, example := dateLayout, "2024-07-01"
		if p.Type == "month" {
			layout, example = monthLayout, "2024-07"
		}
		s, ok := v.(string)
		if !ok {
			return invalid("%s must be a %s like %s", p.Name, p.Type, example)
		}
		if _, err := time.Parse(layout, s); err != nil {
			return invalid("%s must be a %s like %s", p.Name, p.Type, example)
		}
		// Fixed-width ISO strings compare chronologically as plain strings.
		if lo, ok := p.Min.(string); ok && s < lo {
			return invalid("%s must be %s or later", p.Name, lo)
		}
		if hi, ok := p.Max.(string); ok && s > hi {
			return invalid("%s must be %s or earlier", p.Name, hi)
		}
	case "dataset":
		s, _ := v.(string)
		if err := datasets.ValidateName(s); err != nil {
			return invalid("%s must be a dataset name", p.Name)
		}
	default:
		return invalid("%s has unsupported type %q", p.Name, p.Type)
	}
	return nil
}

// less orders two already-validated values of the same type: numbers
// numerically, dates and months as strings.
func less(a, b any) bool {
	if x, ok := a.(float64); ok {
		y, _ := b.(float64)
		return x < y
	}
	x, _ := a.(string)
	y, _ := b.(string)
	return x < y
}
