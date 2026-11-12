package health

import "testing"

func TestDeriveOverallStatus(t *testing.T) {
	mk := func(statuses ...Status) []ServiceHealth {
		out := make([]ServiceHealth, len(statuses))
		for i, s := range statuses {
			out[i] = ServiceHealth{ID: string(rune('a' + i)), Status: s}
		}
		return out
	}
	cases := []struct {
		name string
		in   []ServiceHealth
		want Status
	}{
		{"empty is good", nil, StatusGood},
		{"all good", mk(StatusGood, StatusGood), StatusGood},
		{"one warn", mk(StatusGood, StatusWarn, StatusGood), StatusWarn},
		{"crit beats warn", mk(StatusWarn, StatusCrit, StatusWarn), StatusCrit},
		{"crit first", mk(StatusCrit, StatusGood), StatusCrit},
	}
	for _, tc := range cases {
		if got := DeriveOverallStatus(tc.in); got != tc.want {
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}
}
