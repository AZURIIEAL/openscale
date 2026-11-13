package jobs

import "time"

// ExpandMonthRange lists every "YYYY-MM" month from start to end inclusive.
// It returns nil for malformed input or an end before the start, so a
// caller summing months over many stored param blobs can skip bad rows
// instead of failing the whole count. Lives here (not internal/db) so it
// is unit-testable without a database driver.
func ExpandMonthRange(start, end string) []string {
	startT, errStart := time.Parse("2006-01", start)
	endT, errEnd := time.Parse("2006-01", end)
	if errStart != nil || errEnd != nil || endT.Before(startT) {
		return nil
	}
	var months []string
	for t := startT; !t.After(endT); t = t.AddDate(0, 1, 0) {
		months = append(months, t.Format("2006-01"))
	}
	return months
}
