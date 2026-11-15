package pipelines

import (
	"errors"
	"strings"
	"testing"

	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
)

func status(s jobs.Status) *jobs.Status { return &s }

func TestNext(t *testing.T) {
	cases := []struct {
		name       string
		steps, cur int
		job        *jobs.Status
		want       Action
		wantStatus jobs.Status
	}{
		{"no job yet", 3, 0, nil, Dispatch, jobs.StatusRunning},
		{"queued", 3, 0, status(jobs.StatusQueued), Wait, jobs.StatusRunning},
		{"running", 3, 1, status(jobs.StatusRunning), Wait, jobs.StatusRunning},
		{"succeeded mid", 3, 1, status(jobs.StatusSucceeded), Advance, jobs.StatusRunning},
		{"partial mid", 3, 0, status(jobs.StatusPartial), Advance, jobs.StatusRunning},
		{"succeeded last", 3, 2, status(jobs.StatusSucceeded), Finish, jobs.StatusSucceeded},
		{"partial last", 1, 0, status(jobs.StatusPartial), Finish, jobs.StatusSucceeded},
		{"failed", 3, 1, status(jobs.StatusFailed), Finish, jobs.StatusFailed},
		{"cancelled", 3, 0, status(jobs.StatusCancelled), Finish, jobs.StatusCancelled},
	}
	for _, c := range cases {
		got, gotStatus := Next(c.steps, c.cur, c.job)
		if got != c.want || gotStatus != c.wantStatus {
			t.Errorf("%s: got (%v, %s), want (%v, %s)", c.name, got, gotStatus, c.want, c.wantStatus)
		}
	}
}

func TestParseSteps(t *testing.T) {
	steps, err := ParseSteps([]byte(`[{"jobType":" silver "},{"jobType":"gold","params":{"x":1}}]`))
	if err != nil {
		t.Fatal(err)
	}
	if steps[0].JobType != "silver" || steps[0].Params == nil || steps[1].Params["x"] != float64(1) {
		t.Fatalf("unexpected steps: %+v", steps)
	}

	for _, raw := range []string{
		`[]`,
		`{}`,
		`[{"jobType":""}]`,
		`[{"jobType":"a","extra":1}]`,
		`[` + strings.Repeat(`{"jobType":"a"},`, MaxSteps) + `{"jobType":"a"}]`,
	} {
		if _, err := ParseSteps([]byte(raw)); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: want ErrInvalid, got %v", raw, err)
		}
	}
}

func TestCheckSteps(t *testing.T) {
	defs := map[string]jobs.Definition{
		"gold":  {Type: "gold", RequiresFeature: "legacy_taxi"},
		"train": {Type: "train", ParamsSchema: []jobs.ParamSpec{{Name: "target", Type: "string", Required: true}}},
	}
	lookup := func(t string) (jobs.Definition, error) {
		d, ok := defs[t]
		if !ok {
			return jobs.Definition{}, errors.New("unknown job type")
		}
		return d, nil
	}
	taxi := func(f string) bool { return f == "legacy_taxi" }
	none := func(string) bool { return false }

	ok := []Step{{JobType: "gold", Params: map[string]any{}}, {JobType: "train", Params: map[string]any{"target": "fare"}}}
	if err := CheckSteps(ok, lookup, taxi); err != nil {
		t.Fatalf("valid steps refused: %v", err)
	}

	bad := map[string]struct {
		steps []Step
		has   func(string) bool
	}{
		"unknown type":  {[]Step{{JobType: "nope", Params: map[string]any{}}}, taxi},
		"feature":       {[]Step{{JobType: "gold", Params: map[string]any{}}}, none},
		"missing param": {[]Step{{JobType: "train", Params: map[string]any{}}}, taxi},
		"unknown param": {[]Step{{JobType: "gold", Params: map[string]any{"x": 1}}}, taxi},
	}
	for name, c := range bad {
		err := CheckSteps(c.steps, lookup, c.has)
		if !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "step 1") {
			t.Errorf("%s: want ErrInvalid naming step 1, got %v", name, err)
		}
	}
}

func TestValidateName(t *testing.T) {
	if err := ValidateName("taxi_daily"); err != nil {
		t.Fatal(err)
	}
	for _, n := range []string{"", "Taxi", "1x", "a-b"} {
		if err := ValidateName(n); !errors.Is(err, ErrInvalid) {
			t.Errorf("%q: want ErrInvalid", n)
		}
	}
}
