import { useEffect, useState } from 'react';
import type { JobRun, JobState } from '../domain/entities';
import { waitForRunTerminal } from './waitForRunTerminal';

/** How long the "All N steps complete" banner and each row's "Completed"
 * pill stay up before the screen reverts to its default state. Long enough
 * to read, short enough not to look stuck. */
const DONE_RESET_DELAY_MS = 2500;

/** Dependency order -- each stage reads the previous stage's output. */
export const PIPELINE_ORDER = ['ingest', 'silver', 'gold', 'features', 'train'] as const;

export type RunAllState =
  | { phase: 'idle' }
  | { phase: 'running'; stepIndex: number }
  | { phase: 'stopped'; stepIndex: number; jobType: string }
  | { phase: 'done' };

type TriggerFn = (args: { jobType: string; params: Record<string, string> }) => Promise<JobRun>;

/**
 * Sequentially triggers every pipeline stage, waiting for each to reach a
 * terminal state (over the same WebSocket the live log panel uses) before
 * starting the next -- running Gold before Silver has any data would just
 * fail anyway, so a failed step stops the chain rather than plowing ahead.
 * Only `ingest` takes the user-supplied date range; every later stage
 * processes whatever's currently available upstream, same as a manual
 * single-job trigger.
 */
export function useRunAllJobs(triggerRun: TriggerFn, onRunStarted: (runId: string) => void) {
  const [state, setState] = useState<RunAllState>({ phase: 'idle' });

  // Once every step has finished, drop back to the default state on its
  // own rather than leaving "All N steps complete" (and each row's
  // "Completed" pill) up forever -- the user has to click "Run all" again
  // either way, so there's nothing left for the done state to communicate
  // after a moment.
  useEffect(() => {
    if (state.phase !== 'done') return;
    const timer = setTimeout(() => setState({ phase: 'idle' }), DONE_RESET_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.phase]);

  async function runAll(range: Record<string, string>) {
    for (let i = 0; i < PIPELINE_ORDER.length; i++) {
      const jobType = PIPELINE_ORDER[i];
      setState({ phase: 'running', stepIndex: i });
      const run = await triggerRun({ jobType, params: jobType === 'ingest' ? range : {} });
      onRunStarted(run.id);
      const finalState: JobState = await waitForRunTerminal(run.id);
      if (finalState === 'failed') {
        setState({ phase: 'stopped', stepIndex: i, jobType });
        return;
      }
    }
    setState({ phase: 'done' });
  }

  return { state, runAll, reset: () => setState({ phase: 'idle' }) };
}
