package datasets

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// Rule is one quality rule in datasets.rules, run by the worker's validate
// job and the taxi Silver job (libs/openscale/openscale/rules.py, which
// documents the tiers). The shape checks here mirror parse_rules there, so
// a rule saved through the API always parses in the worker; whether `when`
// is valid SQL for the dataset is checked by the query engine on save.
type Rule struct {
	ID     string `json:"id"`
	Tier   string `json:"tier"`
	When   string `json:"when"`
	Note   string `json:"note,omitempty"`
	Column string `json:"column,omitempty"`
}

// RuleTiers, in the order the editor offers them.
var RuleTiers = []string{"reject", "quarantine", "flag", "monitor"}

const (
	// MaxRules bounds one dataset's list; every rule costs a column in
	// the validate job's single scan.
	MaxRules = 200
	// MaxRuleWhen bounds one predicate.
	MaxRuleWhen = 4000
)

var (
	ruleIDPattern    = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)
	identPattern     = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,62}$`)
	nonIdentRunePatt = regexp.MustCompile(`[^A-Za-z0-9_]`)
)

// FlagColumn is the boolean column a flag rule adds to the kept rows:
// Column when set, else flag_<id> with non-identifier characters as "_".
func (r Rule) FlagColumn() string {
	if r.Column != "" {
		return r.Column
	}
	return "flag_" + strings.ToLower(nonIdentRunePatt.ReplaceAllString(r.ID, "_"))
}

// ErrInvalidRules wraps every reason a rules list is refused.
var ErrInvalidRules = errors.New("invalid rules")

func invalidRule(format string, args ...any) error {
	return fmt.Errorf("%w: "+format, append([]any{ErrInvalidRules}, args...)...)
}

// ParseRules decodes and validates a rules list against the dataset's
// columns (a flag column can't shadow one). Text fields are trimmed; the
// result is what gets stored.
func ParseRules(raw json.RawMessage, columns []Column) ([]Rule, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var rules []Rule
	if err := dec.Decode(&rules); err != nil {
		return nil, invalidRule("rules must be a list of {id, tier, when, note, column} objects: %v", err)
	}
	if rules == nil {
		rules = []Rule{}
	}
	if len(rules) > MaxRules {
		return nil, invalidRule("at most %d rules per dataset", MaxRules)
	}

	existing := make(map[string]bool, len(columns))
	for _, c := range columns {
		existing[strings.ToLower(c.Name)] = true
	}
	ids := map[string]bool{}
	flagColumns := map[string]bool{}
	for i := range rules {
		r := &rules[i]
		r.ID = strings.TrimSpace(r.ID)
		r.When = strings.TrimSpace(r.When)
		r.Note = strings.TrimSpace(r.Note)
		r.Column = strings.TrimSpace(r.Column)

		if !ruleIDPattern.MatchString(r.ID) {
			return nil, invalidRule("rule %d: id must be 1-64 letters, digits, '.', '_' or '-'", i+1)
		}
		if ids[r.ID] {
			return nil, invalidRule("rule %s: duplicate id", r.ID)
		}
		ids[r.ID] = true
		if !validTier(r.Tier) {
			return nil, invalidRule("rule %s: tier must be one of %s", r.ID, strings.Join(RuleTiers, ", "))
		}
		if r.When == "" {
			return nil, invalidRule("rule %s: `when` must be a SQL condition", r.ID)
		}
		if len(r.When) > MaxRuleWhen {
			return nil, invalidRule("rule %s: `when` is longer than %d characters", r.ID, MaxRuleWhen)
		}
		if r.Column != "" && r.Tier != "flag" {
			return nil, invalidRule("rule %s: only flag rules take a column", r.ID)
		}
		if r.Tier == "flag" {
			col := r.FlagColumn()
			if !identPattern.MatchString(col) {
				return nil, invalidRule("rule %s: flag column %q must be letters, digits and underscores, starting with a letter", r.ID, col)
			}
			// DuckDB resolves identifiers case-insensitively.
			key := strings.ToLower(col)
			if existing[key] {
				return nil, invalidRule("rule %s: flag column %q already exists in the dataset", r.ID, col)
			}
			if flagColumns[key] {
				return nil, invalidRule("rule %s: flag column %q is used twice", r.ID, col)
			}
			flagColumns[key] = true
		}
	}
	return rules, nil
}

func validTier(t string) bool {
	for _, v := range RuleTiers {
		if t == v {
			return true
		}
	}
	return false
}
