package sqlcheck

import "testing"

func TestValidateReadOnly(t *testing.T) {
	cases := []struct {
		name   string
		sql    string
		ok     bool
		reason string
	}{
		{"plain select", "SELECT 1", true, ""},
		{"lowercase select", "select * from gold_daily_revenue", true, ""},
		{"with cte", "WITH t AS (SELECT 1) SELECT * FROM t", true, ""},
		{"leading whitespace", "   \n\tSELECT 1", true, ""},
		{"leading line comment", "-- hello\nSELECT 1", true, ""},
		{"leading block comment", "/* hi */ SELECT 1", true, ""},
		{"trailing semicolon", "SELECT 1;", true, ""},
		{"trailing semicolon and whitespace", "SELECT 1;  \n", true, ""},
		{"semicolon inside string literal", "SELECT ';' AS s", true, ""},
		{"semicolon inside escaped string", "SELECT 'it''s; fine'", true, ""},
		{"semicolon inside quoted identifier", `SELECT 1 AS "a;b"`, true, ""},
		{"semicolon inside dollar quote", "SELECT $$a;b$$", true, ""},
		{"semicolon inside tagged dollar quote", "SELECT $q$a;b$q$", true, ""},
		{"semicolon inside line comment", "SELECT 1 -- ; not a split\n", true, ""},
		{"semicolon inside block comment", "SELECT /* ; */ 1", true, ""},
		{"placeholder dollar is not a quote", "SELECT $1; SELECT 2", false, "Only a single SQL statement is allowed."},

		{"empty", "", false, "SQL query cannot be empty."},
		{"whitespace only", "  \n ", false, "SQL query cannot be empty."},
		{"comment only", "-- nothing", false, "Only SELECT queries are allowed."},
		{"insert", "INSERT INTO t VALUES (1)", false, "Only SELECT queries are allowed."},
		{"delete", "DELETE FROM t", false, "Only SELECT queries are allowed."},
		{"update", "update t set a = 1", false, "Only SELECT queries are allowed."},
		{"drop after comment", "/* SELECT */ DROP TABLE t", false, "Only SELECT queries are allowed."},
		{"selection is not select", "selection", false, "Only SELECT queries are allowed."},
		{"within is not with", "within t", false, "Only SELECT queries are allowed."},
		{"two statements", "SELECT 1; SELECT 2", false, "Only a single SQL statement is allowed."},
		{"select then drop", "SELECT 1; DROP TABLE t", false, "Only a single SQL statement is allowed."},
		{"select then comment then drop", "SELECT 1; -- x\nDROP TABLE t", false, "Only a single SQL statement is allowed."},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			reason, ok := ValidateReadOnly(tc.sql)
			if ok != tc.ok {
				t.Fatalf("ValidateReadOnly(%q) ok = %v, want %v (reason %q)", tc.sql, ok, tc.ok, reason)
			}
			if reason != tc.reason {
				t.Fatalf("ValidateReadOnly(%q) reason = %q, want %q", tc.sql, reason, tc.reason)
			}
		})
	}
}

func TestSplitStatements(t *testing.T) {
	cases := []struct {
		sql  string
		want int
	}{
		{"SELECT 1", 1},
		{"SELECT 1;", 1},
		{"SELECT 1;;;", 1},
		{"SELECT 1; SELECT 2", 2},
		{"SELECT 1; SELECT 2;", 2},
		{"SELECT 'a;b'; SELECT 2", 2},
		{"SELECT 'a;b'", 1},
		{"SELECT 'unterminated; still one", 1},
		{"SELECT $$;$$ ; SELECT $x$;$x$", 2},
		{"/* ; */ SELECT 1", 1},
		{";", 0},
		{"", 0},
		{"-- only a comment", 0},
	}
	for _, tc := range cases {
		if got := len(SplitStatements(tc.sql)); got != tc.want {
			t.Errorf("SplitStatements(%q) = %d statements, want %d", tc.sql, got, tc.want)
		}
	}
}

func TestTrimLeadingNoise(t *testing.T) {
	cases := map[string]string{
		"SELECT 1":                  "SELECT 1",
		"  SELECT 1":                "SELECT 1",
		"-- c\nSELECT 1":            "SELECT 1",
		"/* c */\n  -- d\nSELECT 1": "SELECT 1",
		"/* unterminated":           "",
		"-- no newline":             "",
	}
	for in, want := range cases {
		if got := TrimLeadingNoise(in); got != want {
			t.Errorf("TrimLeadingNoise(%q) = %q, want %q", in, got, want)
		}
	}
}
