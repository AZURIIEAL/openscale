import { wsUrl } from '@/shared/api/httpClient';
import type { JobState } from '../domain/entities';

const TERMINAL_STATES: JobState[] = ['succeeded', 'partial', 'failed', 'cancelled'];

/**
 * Opens a WebSocket to the job's status stream and resolves once it
 * reaches a terminal state. A promise-based wrapper around the same
 * backfill+event protocol useJobRunEvents already parses (a plain Run
 * object with no `type` on connect, `{type: 'status'|'log', ...}` after),
 * for imperative use inside Run All's sequential await-loop -- not a React
 * hook, since nothing here renders.
 */
export function waitForRunTerminal(jobId: string): Promise<JobState> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl(`/api/ws/jobs/${jobId}`));

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const state: JobState | undefined = 'type' in data ? (data.type === 'status' ? data.status : undefined) : data.status;
      if (state && TERMINAL_STATES.includes(state)) {
        resolve(state);
        socket.close();
      }
    };
    socket.onerror = () => reject(new Error(`WebSocket error while waiting for run ${jobId}`));
  });
}
