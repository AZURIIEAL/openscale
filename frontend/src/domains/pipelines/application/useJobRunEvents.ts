import { useEffect, useReducer } from 'react';
import { wsUrl } from '@/shared/api/httpClient';
import type { JobState } from '../domain/entities';

interface JobRunEventsState {
  state: JobState | null;
  logLines: string[];
}

type Action =
  | { type: 'reset' }
  | { type: 'backfill'; state: JobState; logOutput?: string }
  | { type: 'status'; state: JobState }
  | { type: 'log'; line: string };

function reducer(current: JobRunEventsState, action: Action): JobRunEventsState {
  switch (action.type) {
    case 'reset':
      return { state: null, logLines: [] };
    case 'backfill':
      return { state: action.state, logLines: action.logOutput ? action.logOutput.split('\n') : [] };
    case 'status':
      return { ...current, state: action.state };
    case 'log':
      return { ...current, logLines: [...current.logLines, action.line] };
  }
}

/**
 * Live status/log stream for one in-flight job run, over the
 * control-plane's per-job WebSocket endpoint. Used only for the
 * currently-active run in PipelinesScreen -- history stays on
 * useJobRuns' polling, no need to multiplex N sockets for a list that
 * 10s polling already covers well.
 *
 * The socket carries two message shapes distinguished by a `type` field:
 * the connect-time backfill frame is a plain job Run (no `type`), every
 * frame after that is a `{type: 'status'|'log', ...}` event.
 */
export function useJobRunEvents(jobId: string | null) {
  const [state, dispatch] = useReducer(reducer, { state: null, logLines: [] });

  useEffect(() => {
    dispatch({ type: 'reset' });
    if (!jobId) return;

    const socket = new WebSocket(wsUrl(`/api/ws/jobs/${jobId}`));

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if ('type' in data) {
        if (data.type === 'status') {
          dispatch({ type: 'status', state: data.status });
        } else if (data.type === 'log') {
          dispatch({ type: 'log', line: data.line });
        }
      } else {
        dispatch({ type: 'backfill', state: data.status, logOutput: data.logOutput ?? undefined });
      }
    };

    return () => socket.close();
  }, [jobId]);

  return state;
}
