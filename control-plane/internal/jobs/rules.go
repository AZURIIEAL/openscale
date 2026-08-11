package jobs

import "github.com/AZURIIEAL/openscale/control-plane/internal/health"

// DisplayStatus maps a job's 4-value Status down to the shared 3-tier
// good/warn/crit signal the rest of the UI already understands (StatusPill,
// Led), mirroring health.DeriveOverallStatus's worst-status-wins pattern.
func DisplayStatus(s Status) health.Status {
	switch s {
	case StatusSucceeded:
		return health.StatusGood
	case StatusFailed:
		return health.StatusCrit
	default: // queued | running | partial
		return health.StatusWarn
	}
}
