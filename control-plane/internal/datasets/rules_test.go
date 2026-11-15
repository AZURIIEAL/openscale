package datasets

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestParseRules(t *testing.T) {
	cols := []Column{{Name: "fare", Type: "DOUBLE"}, {Name: "Pickup", Type: "TIMESTAMP"}}
	cases := []struct {
		name    string
		body    string
		wantErr string // "" = valid
	}{
		{"empty list", `[]`, ""},
		{"null is empty", `null`, ""},
		{"all tiers", `[
			{"id": "SLV-003", "tier": "reject", "when": "dropoff <= pickup", "note": "Dropoff is not after pickup"},
			{"id": "neg_fare", "tier": "quarantine", "when": "fare < 0"},
			{"id": "y.2024", "tier": "flag", "when": "year(pickup) <> 2024", "column": "flag_year"},
			{"id": "m1", "tier": "monitor", "when": "fare IS NULL"}
		]`, ""},
		{"not a list", `{"id": "a"}`, "must be a list"},
		{"unknown key", `[{"id": "a", "tier": "reject", "when": "x", "severity": 3}]`, "must be a list"},
		{"bad id", `[{"id": "-a", "tier": "reject", "when": "x"}]`, "rule 1: id must be"},
		{"blank id", `[{"id": "  ", "tier": "reject", "when": "x"}]`, "rule 1: id must be"},
		{"duplicate id", `[{"id": "a", "tier": "reject", "when": "x"}, {"id": "a", "tier": "monitor", "when": "y"}]`, "rule a: duplicate id"},
		{"bad tier", `[{"id": "a", "tier": "drop", "when": "x"}]`, "tier must be one of"},
		{"blank when", `[{"id": "a", "tier": "reject", "when": "   "}]`, "must be a SQL condition"},
		{"column on reject", `[{"id": "a", "tier": "reject", "when": "x", "column": "c"}]`, "only flag rules"},
		{"bad flag column", `[{"id": "a", "tier": "flag", "when": "x", "column": "bad name"}]`, "flag column"},
		{"flag shadows a column", `[{"id": "a", "tier": "flag", "when": "x", "column": "FARE"}]`, "already exists"},
		{"default flag column shadows", `[{"id": "x", "tier": "flag", "when": "true"}, {"id": "x2", "tier": "flag", "when": "true", "column": "flag_x"}]`, "used twice"},
		{"long when", `[{"id": "a", "tier": "reject", "when": "` + strings.Repeat("x", MaxRuleWhen+1) + `"}]`, "longer than"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseRules(json.RawMessage(tc.body), cols)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("want valid, got %v", err)
				}
				return
			}
			if err == nil || !errors.Is(err, ErrInvalidRules) || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("want ErrInvalidRules containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestParseRulesTrimsAndKeepsOrder(t *testing.T) {
	rules, err := ParseRules(json.RawMessage(`[
		{"id": " b ", "tier": "monitor", "when": "  x > 1 ", "note": " n "},
		{"id": "a", "tier": "reject", "when": "y"}
	]`), nil)
	if err != nil {
		t.Fatal(err)
	}
	if rules[0] != (Rule{ID: "b", Tier: "monitor", When: "x > 1", Note: "n"}) || rules[1].ID != "a" {
		t.Fatalf("got %+v", rules)
	}
}

func TestParseRulesNullIsEmptyList(t *testing.T) {
	rules, err := ParseRules(json.RawMessage(`null`), nil)
	if err != nil || rules == nil || len(rules) != 0 {
		t.Fatalf("want empty non-nil list, got %v, %v", rules, err)
	}
}

func TestParseRulesCap(t *testing.T) {
	items := make([]string, MaxRules+1)
	for i := range items {
		items[i] = fmt.Sprintf(`{"id": "r%d", "tier": "monitor", "when": "true"}`, i)
	}
	body := "[" + strings.Join(items, ",") + "]"
	if _, err := ParseRules(json.RawMessage(body), nil); err == nil || !strings.Contains(err.Error(), "at most") {
		t.Fatalf("want cap error, got %v", err)
	}
}

func TestFlagColumnDefault(t *testing.T) {
	if got := (Rule{ID: "SLV-008"}).FlagColumn(); got != "flag_slv_008" {
		t.Fatalf("got %q", got)
	}
	if got := (Rule{ID: "x", Column: "custom"}).FlagColumn(); got != "custom" {
		t.Fatalf("got %q", got)
	}
}
