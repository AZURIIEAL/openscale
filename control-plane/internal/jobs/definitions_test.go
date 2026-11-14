package jobs

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// The schemas the worker publishes for ingest and replay (worker/jobs/),
// decoded the way internal/db decodes params_schema.
const ingestSchema = `[
  {"name": "start", "type": "month", "label": "Start", "required": true, "min": "2009-01"},
  {"name": "end", "type": "month", "label": "End", "required": true, "min": "2009-01", "gte": "start"}
]`

const replaySchema = `[
  {"name": "limit", "type": "integer", "label": "Trips to send", "default": 500, "min": 1, "max": 5000},
  {"name": "messagesPerSecond", "type": "number", "label": "Messages per second", "default": 10, "min": 0.1, "max": 100},
  {"name": "date", "type": "date", "label": "Pickup date"}
]`

const mixedSchema = `[
  {"name": "mode", "type": "enum", "label": "Mode", "options": ["fast", "full"]},
  {"name": "dryRun", "type": "boolean", "label": "Dry run"},
  {"name": "note", "type": "string", "label": "Note"},
  {"name": "input", "type": "dataset", "label": "Input dataset", "required": true}
]`

func definition(t *testing.T, jobType, schema string) Definition {
	t.Helper()
	var specs []ParamSpec
	if err := json.Unmarshal([]byte(schema), &specs); err != nil {
		t.Fatalf("bad test schema: %v", err)
	}
	return Definition{Type: jobType, ParamsSchema: specs}
}

func TestValidateParams(t *testing.T) {
	cases := []struct {
		name    string
		schema  string
		body    string
		wantErr string // "" = valid; otherwise a substring of the error
	}{
		{"ingest range", ingestSchema, `{"start": "2024-07", "end": "2024-12"}`, ""},
		{"ingest single month", ingestSchema, `{"start": "2024-07", "end": "2024-07"}`, ""},
		{"ingest missing end", ingestSchema, `{"start": "2024-07"}`, "end is required"},
		{"ingest empty start", ingestSchema, `{"start": "", "end": "2024-07"}`, "start is required"},
		{"ingest end before start", ingestSchema, `{"start": "2024-09", "end": "2024-07"}`, "end must be on or after start"},
		{"ingest before data begins", ingestSchema, `{"start": "2008-12", "end": "2009-02"}`, "start must be 2009-01 or later"},
		{"ingest malformed month", ingestSchema, `{"start": "2024-7", "end": "2024-09"}`, "start must be a month like 2024-07"},
		{"ingest month 13", ingestSchema, `{"start": "2024-13", "end": "2024-13"}`, "must be a month"},
		{"unknown key", ingestSchema, `{"start": "2024-07", "end": "2024-07", "force": true}`, `unknown parameter "force"`},

		{"replay defaults", replaySchema, `{}`, ""},
		{"replay all set", replaySchema, `{"limit": 200, "messagesPerSecond": 2.5, "date": "2024-07-04"}`, ""},
		{"replay numbers as strings", replaySchema, `{"limit": "200"}`, "limit must be a number"},
		{"replay fractional limit", replaySchema, `{"limit": 1.5}`, "limit must be a whole number"},
		{"replay limit too high", replaySchema, `{"limit": 5001}`, "limit must be at most 5000"},
		{"replay rate too low", replaySchema, `{"messagesPerSecond": 0.05}`, "messagesPerSecond must be at least 0.1"},
		{"replay bad date", replaySchema, `{"date": "07/04/2024"}`, "date must be a date like 2024-07-01"},
		{"replay null date is unset", replaySchema, `{"date": null}`, ""},

		{"mixed ok", mixedSchema, `{"mode": "full", "dryRun": true, "note": "hi", "input": "trips_2024"}`, ""},
		{"enum outside options", mixedSchema, `{"mode": "slow", "input": "trips"}`, "mode must be one of"},
		{"boolean as string", mixedSchema, `{"dryRun": "true", "input": "trips"}`, "dryRun must be true or false"},
		{"string as number", mixedSchema, `{"note": 3, "input": "trips"}`, "note must be a string"},
		{"dataset name rules", mixedSchema, `{"input": "Trips 2024"}`, "input must be a dataset name"},
		{"dataset required", mixedSchema, `{}`, "input is required"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			params, err := ParseParams([]byte(tc.body))
			if err != nil {
				t.Fatalf("ParseParams: %v", err)
			}
			err = definition(t, "job", tc.schema).ValidateParams(params)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("want valid, got %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("want error containing %q, got nil", tc.wantErr)
			}
			if !errors.Is(err, ErrInvalidParams) {
				t.Errorf("error should wrap ErrInvalidParams: %v", err)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("error %q should contain %q", err, tc.wantErr)
			}
		})
	}
}

func TestValidateParamsNoSchemaRejectsAnyKey(t *testing.T) {
	d := Definition{Type: "gold"}
	if err := d.ValidateParams(map[string]any{}); err != nil {
		t.Fatalf("empty params on a no-param job: %v", err)
	}
	if err := d.ValidateParams(map[string]any{"start": "2024-07"}); !errors.Is(err, ErrInvalidParams) {
		t.Fatalf("want ErrInvalidParams for a stray key, got %v", err)
	}
}

func TestParseParams(t *testing.T) {
	for _, body := range []string{"", "  ", "{}"} {
		params, err := ParseParams([]byte(body))
		if err != nil || len(params) != 0 {
			t.Errorf("ParseParams(%q) = %v, %v; want empty map", body, params, err)
		}
	}
	for _, body := range []string{"[]", `"x"`, "3", "null", "{bad"} {
		if _, err := ParseParams([]byte(body)); !errors.Is(err, ErrInvalidParams) {
			t.Errorf("ParseParams(%q) should be ErrInvalidParams, got %v", body, err)
		}
	}
}
