// Package sqlcheck is the fail-fast half of the SQL Editor's safety design:
// a quick, dependency-free rejection of anything that is obviously not a
// single read, before the text ever reaches a database. It is NOT the real
// enforcement -- the read-only transaction in internal/db (and, later, the
// locked-down DuckDB session in the query engine) is what actually stops a
// write that slips past this check. Keeping it free of third-party imports
// means it can be unit-tested anywhere `go test` runs.
package sqlcheck

import "strings"

// ValidateReadOnly reports whether sql is exactly one SELECT or WITH
// statement. It returns a user-facing rejection reason and false otherwise.
func ValidateReadOnly(sql string) (string, bool) {
	if strings.TrimSpace(sql) == "" {
		return "SQL query cannot be empty.", false
	}

	body := TrimLeadingNoise(sql)
	lower := strings.ToLower(body)
	if !hasKeywordPrefix(lower, "select") && !hasKeywordPrefix(lower, "with") {
		return "Only SELECT queries are allowed.", false
	}

	if len(SplitStatements(sql)) > 1 {
		return "Only a single SQL statement is allowed.", false
	}

	return "", true
}

// hasKeywordPrefix is a word-boundary-aware prefix check: "selection" or
// "within" must not pass as "select"/"with".
func hasKeywordPrefix(lower, keyword string) bool {
	if !strings.HasPrefix(lower, keyword) {
		return false
	}
	if len(lower) == len(keyword) {
		return true
	}
	next := lower[len(keyword)]
	return !(next == '_' || (next >= 'a' && next <= 'z') || (next >= '0' && next <= '9'))
}

// TrimLeadingNoise strips leading whitespace and comments (-- line, /* block */)
// so the SELECT/WITH prefix check isn't fooled by a query that merely starts
// with a comment.
func TrimLeadingNoise(sql string) string {
	s := sql
	for {
		next := strings.TrimLeft(s, " \t\r\n")
		switch {
		case strings.HasPrefix(next, "--"):
			if idx := strings.IndexByte(next, '\n'); idx >= 0 {
				next = next[idx+1:]
			} else {
				next = ""
			}
		case strings.HasPrefix(next, "/*"):
			if idx := strings.Index(next, "*/"); idx >= 0 {
				next = next[idx+2:]
			} else {
				next = ""
			}
		}
		if next == s {
			return next
		}
		s = next
	}
}

// SplitStatements splits sql on top-level semicolons and returns the
// segments that aren't pure whitespace or comments. Semicolons inside
// single-quoted strings, double-quoted identifiers, dollar-quoted strings
// and comments do not split, so `SELECT ';'` is one statement. An optional
// trailing semicolon is tolerated.
func SplitStatements(sql string) []string {
	var statements []string
	var cur strings.Builder

	flush := func() {
		if strings.TrimSpace(TrimLeadingNoise(cur.String())) != "" {
			statements = append(statements, cur.String())
		}
		cur.Reset()
	}

	i := 0
	n := len(sql)
	for i < n {
		c := sql[i]
		switch {
		case c == '\'':
			end := scanQuoted(sql, i, '\'')
			cur.WriteString(sql[i:end])
			i = end
		case c == '"':
			end := scanQuoted(sql, i, '"')
			cur.WriteString(sql[i:end])
			i = end
		case c == '$':
			if tag, ok := dollarTag(sql, i); ok {
				end := strings.Index(sql[i+len(tag):], tag)
				if end < 0 {
					cur.WriteString(sql[i:])
					i = n
				} else {
					stop := i + len(tag) + end + len(tag)
					cur.WriteString(sql[i:stop])
					i = stop
				}
			} else {
				cur.WriteByte(c)
				i++
			}
		case c == '-' && i+1 < n && sql[i+1] == '-':
			end := strings.IndexByte(sql[i:], '\n')
			if end < 0 {
				cur.WriteString(sql[i:])
				i = n
			} else {
				cur.WriteString(sql[i : i+end+1])
				i += end + 1
			}
		case c == '/' && i+1 < n && sql[i+1] == '*':
			end := strings.Index(sql[i+2:], "*/")
			if end < 0 {
				cur.WriteString(sql[i:])
				i = n
			} else {
				cur.WriteString(sql[i : i+2+end+2])
				i += 2 + end + 2
			}
		case c == ';':
			flush()
			i++
		default:
			cur.WriteByte(c)
			i++
		}
	}
	flush()
	return statements
}

// scanQuoted returns the index just past the closing quote that starts at
// sql[start]. A doubled quote (” or "") is an escape, not a terminator. An
// unterminated literal runs to the end of the input.
func scanQuoted(sql string, start int, quote byte) int {
	i := start + 1
	for i < len(sql) {
		if sql[i] == quote {
			if i+1 < len(sql) && sql[i+1] == quote {
				i += 2
				continue
			}
			return i + 1
		}
		i++
	}
	return len(sql)
}

// dollarTag recognises a Postgres dollar-quote opener at sql[i] ($$ or
// $tag$) and returns it. A lone $ (as in $1 placeholders) is not a tag.
func dollarTag(sql string, i int) (string, bool) {
	if i >= len(sql) || sql[i] != '$' {
		return "", false
	}
	j := i + 1
	for j < len(sql) {
		c := sql[j]
		if c == '$' {
			return sql[i : j+1], true
		}
		isTagChar := c == '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (j > i+1 && c >= '0' && c <= '9')
		if !isTagChar {
			return "", false
		}
		j++
	}
	return "", false
}
