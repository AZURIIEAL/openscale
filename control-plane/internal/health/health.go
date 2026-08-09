// Package health holds the system-health domain: the types and pure rules
// for describing service status. It mirrors
// frontend/src/domains/system-health/domain exactly, since the two sides
// share this contract over HTTP -- keep them in lockstep by hand until an
// OpenAPI spec generates both.
package health

// Status is the three-tier health signal shown throughout the UI.
type Status string

const (
	StatusGood Status = "good"
	StatusWarn Status = "warn"
	StatusCrit Status = "crit"
)

// ServiceHealth describes one monitored service.
type ServiceHealth struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status Status `json:"status"`
	Detail string `json:"detail"`
	// ConsoleURL links to the service's own web UI, e.g. MinIO's browser
	// console or Grafana. Omitted for services with no web UI (Kafka,
	// Postgres, Redis) -- the frontend renders those cards as non-clickable.
	ConsoleURL string `json:"consoleUrl,omitempty"`
	// Running is the container's actual running state, straight from
	// Docker -- separate from Status, which also folds in healthcheck
	// results. The frontend uses this (not Status) to decide whether to
	// show a start or stop control: a container can be Status "crit"
	// while still Running (failing its healthcheck), and that should get
	// a stop button, not a start button.
	Running bool `json:"running"`
}

// Summary is the full system-health snapshot returned by the API.
type Summary struct {
	Services      []ServiceHealth `json:"services"`
	OverallStatus Status          `json:"overallStatus"`
}

// severity ranks statuses worst-to-best so DeriveOverallStatus can fold a
// service list down to the single worst signal.
var severity = map[Status]int{
	StatusCrit: 2,
	StatusWarn: 1,
	StatusGood: 0,
}

// DeriveOverallStatus returns the worst status among services, matching the
// frontend's domain/rules.ts "worst status wins" rule. An empty list is
// reported as good -- there is nothing to be unhealthy about.
func DeriveOverallStatus(services []ServiceHealth) Status {
	worst := StatusGood
	for _, s := range services {
		if severity[s.Status] > severity[worst] {
			worst = s.Status
		}
	}
	return worst
}
