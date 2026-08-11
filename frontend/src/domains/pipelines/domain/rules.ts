import type { Status } from '@/shared/types/status';
import type { JobState } from './entities';

/**
 * Frontend mirror of the Go control-plane's jobs.DisplayStatus -- maps a
 * run's 4-value state down to the shared good/warn/crit signal StatusPill
 * and Led already know how to render.
 */
export function deriveRunStatus(state: JobState): Status {
  switch (state) {
    case 'succeeded':
      return 'good';
    case 'failed':
      return 'crit';
    default: // queued | running | partial
      return 'warn';
  }
}

export function stateLabel(state: JobState): string {
  switch (state) {
    case 'succeeded':
      return 'success';
    case 'partial':
      return 'partial';
    case 'failed':
      return 'failed';
    case 'running':
      return 'running';
    case 'queued':
      return 'queued';
  }
}
