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

/** Shared by JobRunsTable (Pipelines) and RecentRunsTable (Home). */
export function formatRunTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString() : '—';
}

export function formatRunRows(rowsProcessed?: number): string {
  return rowsProcessed === undefined ? '—' : rowsProcessed.toLocaleString();
}

/** e.g. "12s (running)" while in progress, "3m 4s" once finished. */
export function formatRunDuration(
  startedAt: string | undefined,
  finishedAt: string | undefined,
  state: JobState,
): string {
  if (!startedAt) return state === 'queued' ? '(queued)' : '—';
  const endMs = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((endMs - new Date(startedAt).getTime()) / 1000));
  const label = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return finishedAt ? label : `${label} (running)`;
}
