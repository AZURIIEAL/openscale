package queries

import (
	"errors"
	"testing"
)

func TestNormalize(t *testing.T) {
	sql, chart, err := Normalize("daily", "  select 1 as d, 2 as n  ", &Chart{Type: "line", X: " d ", Y: "n"})
	if err != nil || sql != "select 1 as d, 2 as n" || chart.X != "d" {
		t.Fatalf("got %q %+v %v", sql, chart, err)
	}
	if _, chart, _ := Normalize("total", "select 1 as n", &Chart{Type: "number", X: "ignored", Y: "n"}); chart.X != "" {
		t.Errorf("number chart keeps no x: %+v", chart)
	}
	if _, chart, err := Normalize("plain", "select 1", nil); err != nil || chart != nil {
		t.Errorf("no chart: %+v %v", chart, err)
	}
}

func TestNormalizeRefuses(t *testing.T) {
	cases := []struct {
		name, sql string
		chart     *Chart
	}{
		{"Bad", "select 1", nil},
		{"q", "delete from t", nil},
		{"q", "select 1; select 2", nil},
		{"q", "select 1", &Chart{Type: "pie", X: "a", Y: "b"}},
		{"q", "select 1", &Chart{Type: "bar", Y: "b"}},
		{"q", "select 1", &Chart{Type: "number"}},
	}
	for _, c := range cases {
		if _, _, err := Normalize(c.name, c.sql, c.chart); !errors.Is(err, ErrInvalid) {
			t.Errorf("%+v: want ErrInvalid, got %v", c, err)
		}
	}
}
