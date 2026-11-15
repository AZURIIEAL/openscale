// Package pipelines is the pipeline domain: a pipeline is an ordered list of
// job steps, run one after another by the control-plane's orchestrator.
// Pure types and rules only; internal/db stores them and internal/api runs
// them.
package pipelines

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
)

// ErrInvalid wraps every reason a pipeline definition is refused (400).
var ErrInvalid = errors.New("invalid pipeline")

// MaxSteps caps a pipeline's length; a chain longer than this is a mistake.
const MaxSteps = 20

// Mirrors the CHECK constraint in migration 0009.
var namePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,62}$`)

// Step is one job of a pipeline, queued with Params when its turn comes.
type Step struct {
	JobType string         `json:"jobType"`
	Params  map[string]any `json:"params"`
}

// Pipeline is a saved, re-runnable chain of steps.
type Pipeline struct {
	ID          string    `json:"id"`
	ProjectID   string    `json:"projectId"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Steps       []Step    `json:"steps"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// StepJob is the job run queued for one step of a pipeline run.
type StepJob struct {
	StepIndex int         `json:"stepIndex"`
	RunID     string      `json:"runId"`
	Status    jobs.Status `json:"status"`
}

// Run is one execution of a pipeline. Status is running until the last
// step succeeds (succeeded), a step fails or is cancelled (failed /
// cancelled), or a person cancels the run (cancelled).
type Run struct {
	ID           string      `json:"id"`
	ProjectID    string      `json:"projectId"`
	PipelineID   *string     `json:"pipelineId,omitempty"`
	PipelineName string      `json:"pipelineName"`
	Steps        []Step      `json:"steps"`
	Status       jobs.Status `json:"status"`
	CurrentStep  int         `json:"currentStep"`
	Error        *string     `json:"error,omitempty"`
	SubmittedAt  time.Time   `json:"submittedAt"`
	FinishedAt   *time.Time  `json:"finishedAt,omitempty"`
	Jobs         []StepJob   `json:"jobs"`
}

// ValidateName checks a pipeline name.
func ValidateName(name string) error {
	if !namePattern.MatchString(name) {
		return fmt.Errorf("%w: name must start with a letter and contain only lowercase letters, digits and underscores (max 63 chars)", ErrInvalid)
	}
	return nil
}

// ParseSteps decodes a steps list strictly (unknown fields refused) and
// checks its shape. Whether each job type exists and accepts its params is
// the catalog's call: see CheckSteps.
func ParseSteps(raw json.RawMessage) ([]Step, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var steps []Step
	if err := dec.Decode(&steps); err != nil {
		return nil, fmt.Errorf("%w: steps must be a list of {jobType, params}: %v", ErrInvalid, err)
	}
	if len(steps) == 0 || len(steps) > MaxSteps {
		return nil, fmt.Errorf("%w: a pipeline needs 1 to %d steps", ErrInvalid, MaxSteps)
	}
	for i := range steps {
		steps[i].JobType = strings.TrimSpace(steps[i].JobType)
		if steps[i].JobType == "" {
			return nil, fmt.Errorf("%w: step %d: jobType is required", ErrInvalid, i+1)
		}
		if steps[i].Params == nil {
			steps[i].Params = map[string]any{}
		}
	}
	return steps, nil
}

// CheckSteps validates every step against the job catalog: the type exists,
// the project may run it and its params satisfy the schema. lookup returns
// the job's definition (an error for an unknown or retired type).
func CheckSteps(steps []Step, lookup func(jobType string) (jobs.Definition, error), hasFeature func(string) bool) error {
	for i, s := range steps {
		def, err := lookup(s.JobType)
		if err == nil {
			err = def.CheckAvailable(hasFeature)
		}
		if err == nil {
			err = def.ValidateParams(s.Params)
		}
		if err != nil {
			return fmt.Errorf("%w: step %d (%s): %v", ErrInvalid, i+1, s.JobType, err)
		}
	}
	return nil
}

// Action is what the orchestrator does next for a running pipeline run.
type Action int

const (
	// Dispatch queues the current step's job (none exists yet).
	Dispatch Action = iota
	// Wait: the current step's job is still queued or running.
	Wait
	// Advance moves to the next step; the current one succeeded.
	Advance
	// Finish ends the run: the last step succeeded, or a step failed or was
	// cancelled. The returned status says which.
	Finish
)

// Next decides a running pipeline run's next move from its step count, its
// current step and that step's job status (nil when no job is queued yet).
// A partial step counts as done, the same as the old browser-side Run All.
func Next(stepCount, current int, job *jobs.Status) (Action, jobs.Status) {
	switch {
	case job == nil:
		return Dispatch, jobs.StatusRunning
	case !jobs.IsTerminal(*job):
		return Wait, jobs.StatusRunning
	case *job == jobs.StatusFailed || *job == jobs.StatusCancelled:
		return Finish, *job
	case current+1 >= stepCount:
		return Finish, jobs.StatusSucceeded
	default:
		return Advance, jobs.StatusRunning
	}
}
