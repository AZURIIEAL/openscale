package jobs

import (
	"reflect"
	"testing"

	"github.com/AZURIIEAL/openscale/control-plane/internal/health"
)

func TestExpandMonthRange(t *testing.T) {
	cases := []struct {
		name       string
		start, end string
		want       []string
	}{
		{"single month", "2024-07", "2024-07", []string{"2024-07"}},
		{"within a year", "2024-07", "2024-09", []string{"2024-07", "2024-08", "2024-09"}},
		{"across a year boundary", "2024-11", "2025-02", []string{"2024-11", "2024-12", "2025-01", "2025-02"}},
		{"end before start", "2024-09", "2024-07", nil},
		{"malformed start", "2024-7", "2024-09", nil},
		{"malformed end", "2024-07", "September", nil},
		{"empty", "", "", nil},
		{"month 13", "2024-13", "2024-13", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ExpandMonthRange(tc.start, tc.end)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("ExpandMonthRange(%q, %q) = %v, want %v", tc.start, tc.end, got, tc.want)
			}
		})
	}
}

func TestExpandMonthRangeLength(t *testing.T) {
	if got := len(ExpandMonthRange("2023-02", "2026-05")); got != 40 {
		t.Fatalf("2023-02..2026-05 should be 40 months, got %d", got)
	}
}

func TestIsKnownJobType(t *testing.T) {
	for _, d := range Catalog {
		if !IsKnownJobType(d.Type) {
			t.Errorf("catalog entry %q not recognised", d.Type)
		}
	}
	for _, unknown := range []string{"", "INGEST", "deploy", "gold "} {
		if IsKnownJobType(unknown) {
			t.Errorf("%q should not be a known job type", unknown)
		}
	}
}

func TestDisplayStatus(t *testing.T) {
	cases := map[Status]health.Status{
		StatusSucceeded: health.StatusGood,
		StatusFailed:    health.StatusCrit,
		StatusQueued:    health.StatusWarn,
		StatusRunning:   health.StatusWarn,
		StatusPartial:   health.StatusWarn,
		StatusCancelled: health.StatusWarn,
	}
	for in, want := range cases {
		if got := DisplayStatus(in); got != want {
			t.Errorf("DisplayStatus(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsTerminal(t *testing.T) {
	terminal := []Status{StatusSucceeded, StatusPartial, StatusFailed, StatusCancelled}
	active := []Status{StatusQueued, StatusRunning}
	for _, s := range terminal {
		if !IsTerminal(s) {
			t.Errorf("%q should be terminal", s)
		}
	}
	for _, s := range active {
		if IsTerminal(s) {
			t.Errorf("%q should not be terminal", s)
		}
	}
}
