package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/rs/zerolog"

	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
	"github.com/AZURIIEAL/openscale/control-plane/internal/pipelines"
)

// reconcileEvery is how often the orchestrator looks at running pipeline
// runs; it is also how long a finished step waits before the next starts.
const reconcileEvery = 2 * time.Second

// Orchestrator runs pipelines. It keeps no state of its own: every pass
// reads the running pipeline runs and their step jobs from Postgres and
// moves each one forward (queue the step, advance, finish), so a restart
// carries on where the last process stopped.
//
// shortcut: assumes one control-plane process; the unique (pipeline_run_id,
// step_index) index stops double-queuing, but two orchestrators would still
// race on advance/finish. Take a Postgres advisory lock per pass if the
// control-plane is ever scaled out.
type Orchestrator struct {
	db         *db.DB
	dispatcher *Dispatcher
	log        zerolog.Logger
	wake       chan struct{}
}

func NewOrchestrator(database *db.DB, dispatcher *Dispatcher, logger zerolog.Logger) *Orchestrator {
	return &Orchestrator{db: database, dispatcher: dispatcher, log: logger, wake: make(chan struct{}, 1)}
}

// Wake asks for a pass now (a run just started) instead of on the next tick.
func (o *Orchestrator) Wake() {
	select {
	case o.wake <- struct{}{}:
	default:
	}
}

// Run reconciles until ctx is cancelled.
func (o *Orchestrator) Run(ctx context.Context) {
	ticker := time.NewTicker(reconcileEvery)
	defer ticker.Stop()
	for {
		o.reconcile(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-o.wake:
		}
	}
}

func (o *Orchestrator) reconcile(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	runs, err := o.db.RunningPipelineRuns(ctx)
	if err != nil {
		o.log.Error().Err(err).Msg("orchestrator: list running pipeline runs")
		return
	}
	for _, r := range runs {
		if err := o.step(ctx, r); err != nil {
			o.log.Error().Err(err).Str("pipelineRun", r.ID).Msg("orchestrator: advance pipeline run")
		}
	}
}

// step moves one run forward as far as it can go right now.
func (o *Orchestrator) step(ctx context.Context, r pipelines.Run) error {
	for {
		action, status := pipelines.Next(len(r.Steps), r.CurrentStep, currentJobStatus(r))
		switch action {
		case pipelines.Wait:
			return nil
		case pipelines.Advance:
			ok, err := o.db.AdvancePipelineRun(ctx, r.ID, r.CurrentStep)
			if err != nil || !ok {
				return err
			}
			r.CurrentStep++
		case pipelines.Finish:
			var msg *string
			if status != jobs.StatusSucceeded {
				m := fmt.Sprintf("step %d (%s) %s", r.CurrentStep+1, r.Steps[r.CurrentStep].JobType, status)
				msg = &m
			}
			_, err := o.db.FinishPipelineRun(ctx, r.ID, status, msg)
			return err
		case pipelines.Dispatch:
			return o.dispatch(ctx, r)
		}
	}
}

func currentJobStatus(r pipelines.Run) *jobs.Status {
	for _, j := range r.Jobs {
		if j.StepIndex == r.CurrentStep {
			return &j.Status
		}
	}
	return nil
}

// dispatch queues the current step's job. The catalog is checked again
// because it may have changed since the run started; a step that no longer
// validates fails the run instead of being retried forever.
func (o *Orchestrator) dispatch(ctx context.Context, r pipelines.Run) error {
	s := r.Steps[r.CurrentStep]
	project, err := o.db.GetProject(ctx, r.ProjectID)
	if err != nil {
		return err
	}
	def, err := o.db.GetJobDefinition(ctx, s.JobType)
	if err == nil {
		err = def.CheckAvailable(project.HasFeature)
	}
	if err == nil {
		err = def.ValidateParams(s.Params)
	}
	if errors.Is(err, db.ErrNotFound) || errors.Is(err, jobs.ErrUnavailable) || errors.Is(err, jobs.ErrInvalidParams) {
		msg := fmt.Sprintf("step %d (%s) can't run: %v", r.CurrentStep+1, s.JobType, err)
		_, err = o.db.FinishPipelineRun(ctx, r.ID, jobs.StatusFailed, &msg)
		return err
	}
	if err != nil {
		return err
	}
	params, err := json.Marshal(s.Params)
	if err != nil {
		return err
	}
	_, _, err = o.dispatcher.DispatchStep(ctx, r.ID, r.CurrentStep, s.JobType, params)
	return err
}
