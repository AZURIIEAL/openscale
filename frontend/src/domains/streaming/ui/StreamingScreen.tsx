import { useState } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { Led } from '@/shared/design-system/Led';
import type { Status } from '@/shared/types/status';
import { useJobRunEvents } from '@/domains/pipelines/application/useJobRunEvents';
import type { JobState } from '@/domains/pipelines/domain/entities';
import { useLiveTripStream } from '../application/useLiveTripStream';
import { useStartReplay } from '../application/useStartReplay';
import { useJobControl } from '../application/useJobControl';
import type { ConnectionStatus } from '../domain/entities';
import { ReplayControls } from './ReplayControls';
import { TopicsPanel } from './TopicsPanel';
import { LiveEventFeed } from './LiveEventFeed';
import { WindowedAggregateChart } from './WindowedAggregateChart';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  disconnected: 'Disconnected — retrying…',
};

const STATUS_LED: Record<ConnectionStatus, Status> = {
  connecting: 'warn',
  live: 'good',
  disconnected: 'crit',
};

// Mirrors pipelines/application/waitForRunTerminal.ts's own TERMINAL_STATES
// (not exported there, so duplicated here rather than reaching into that
// module's internals) -- a replay run is "active" (eligible for
// pause/resume/cancel/speed control) until it reaches one of these.
const TERMINAL_STATES: JobState[] = ['succeeded', 'partial', 'failed', 'cancelled'];

/**
 * Real (this pass's scope): triggers the worker's `replay` job, which
 * streams real Silver trips onto Kafka's yellow-taxi-trips topic
 * (worker/jobs/replay.py), and relays that same topic live over WebSocket
 * via the control-plane's internal/streaming.Consumer + StreamHub. Every
 * trip and window aggregate shown here comes off the real topic -- nothing
 * on this screen is mocked. Unlike every other screen in this app, this one
 * is inherently WebSocket-lifecycle-dependent, hence the connection-status
 * indicator up top.
 */
export function StreamingScreen() {
  const { status, trips, windowHistory } = useLiveTripStream();
  const startReplay = useStartReplay();
  const jobControl = useJobControl();

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { state: activeJobState } = useJobRunEvents(activeJobId);
  const isActive = activeJobId != null && activeJobState != null && !TERMINAL_STATES.includes(activeJobState);

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>
            Streaming
          </h3>
          <p className="text-wrap-pretty" style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Kafka replay of real Silver trips, streamed live over WebSocket.
          </p>
        </div>
        <span className="os-font-mono flex items-center gap-2 text-[11px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
          <Led status={STATUS_LED[status]} label={`WebSocket ${status}`} />
          {STATUS_LABEL[status]}
        </span>
      </Panel>

      <ReplayControls
        pending={startReplay.isPending}
        error={startReplay.isError ? (startReplay.error as Error).message : undefined}
        onStart={(params) => startReplay.mutate(params, { onSuccess: (run) => setActiveJobId(run.id) })}
        activeJobId={activeJobId}
        isActive={isActive}
        onControl={(action, speedMultiplier) =>
          activeJobId && jobControl.mutate({ jobId: activeJobId, action, speedMultiplier })
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopicsPanel />
        <WindowedAggregateChart windows={windowHistory} />
      </div>

      <LiveEventFeed trips={trips} />
    </div>
  );
}
