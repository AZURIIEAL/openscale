import { useEffect, useState, type FormEvent } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { RunButton } from '@/shared/design-system/RunButton';
import { Spinner } from '@/shared/design-system/Spinner';
import { SegmentedToggle } from '@/shared/design-system/SegmentedToggle';
import type { ReplayParams } from '../domain/entities';
import type { JobControlAction } from '../application/useJobControl';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;
const DEFAULT_RATE = 10;
const MAX_RATE = 100;

type SpeedValue = '1' | '2' | '3' | '5' | '10';

const SPEED_OPTIONS: { value: SpeedValue; label: string }[] = [
  { value: '1', label: '×1' },
  { value: '2', label: '×2' },
  { value: '3', label: '×3' },
  { value: '5', label: '×5' },
  { value: '10', label: '×10' },
];

interface ReplayControlsProps {
  pending: boolean;
  onStart: (params: ReplayParams) => void;
  error?: string;
  /** The currently in-flight replay run's job id, or null if none. */
  activeJobId: string | null;
  /** True once activeJobId's live status is known and not yet terminal --
   * see StreamingScreen's TERMINAL_STATES check. */
  isActive: boolean;
  /** Sends a live command to the in-flight run via POST
   * /api/jobs/{id}/control (application/useJobControl.ts). No-op if
   * activeJobId is null. */
  onControl: (action: JobControlAction, speedMultiplier?: number) => void;
}

const inputStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-body)',
  outline: 'none',
  width: 130,
} as const;

/**
 * Triggers the worker's `replay` job (POST /api/jobs/replay/run), which
 * streams real Silver trips onto Kafka's yellow-taxi-trips topic. Date is
 * optional -- left blank, the worker resolves it to the latest available
 * Silver pickup date server-side, so this control never has to know what
 * dates are loaded ahead of time.
 *
 * While a replay is active (isActive), the start form is replaced by a live
 * control row -- Pause/Resume, Cancel, and a ×1/×2/×3/×5/×10 speed picker --
 * that acts on the *currently in-flight* job via onControl. Only one replay
 * runs at a time (the worker processes one job at a time per its consumer
 * group), so the start form has nothing useful to do until this one ends.
 *
 * Pause/Resume label and the highlighted speed both reflect local
 * optimistic intent, not a confirmed server-side state -- the control-plane
 * doesn't echo pause/speed back over any channel this screen already
 * listens to (deliberate: not worth a second round-trip channel for this).
 */
export function ReplayControls({ pending, onStart, error, activeJobId, isActive, onControl }: ReplayControlsProps) {
  const [date, setDate] = useState('');
  const [limit, setLimit] = useState(String(DEFAULT_LIMIT));
  const [rate, setRate] = useState(String(DEFAULT_RATE));

  const [pauseIntent, setPauseIntent] = useState(false);
  const [speed, setSpeed] = useState<SpeedValue>('1');

  // A new replay always starts unpaused at the base rate -- reset local
  // intent whenever the active job changes (including back to null).
  useEffect(() => {
    setPauseIntent(false);
    setSpeed('1');
  }, [activeJobId]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || isActive) return;
    const parsedLimit = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT);
    const parsedRate = Math.min(Math.max(0.1, Number(rate) || DEFAULT_RATE), MAX_RATE);
    onStart({ date: date || undefined, limit: parsedLimit, messagesPerSecond: parsedRate });
  }

  function togglePause() {
    onControl(pauseIntent ? 'resume' : 'pause');
    setPauseIntent((current) => !current);
  }

  function handleSpeedChange(value: SpeedValue) {
    setSpeed(value);
    onControl('setSpeed', Number(value));
  }

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>
          Replay Trips
        </h3>
        <p className="text-wrap-pretty" style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          Streams one day of real Silver trips onto Kafka's yellow-taxi-trips topic, at a configurable send rate.
        </p>
      </div>

      {isActive ? (
        <div className="flex flex-wrap items-end gap-4">
          <RunButton type="button" onClick={togglePause}>
            {pauseIntent ? 'Resume' : 'Pause'}
          </RunButton>

          <button
            type="button"
            className="os-font-mono"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 40,
              padding: '0 18px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--danger)',
              background: 'transparent',
              color: 'var(--danger)',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
            }}
            onClick={() => onControl('cancel')}
          >
            Cancel
          </button>

          <label className="flex flex-col gap-1">
            <span className="os-font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-subtle)' }}>
              Playback speed
            </span>
            <SegmentedToggle items={SPEED_OPTIONS} value={speed} onChange={handleSpeedChange} />
          </label>

          <span className="os-font-mono text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            {pauseIntent ? 'Paused' : 'Replaying'} · job {activeJobId}
          </span>
        </div>
      ) : (
        <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1">
            <span className="os-font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-subtle)' }}>
              Date (optional)
            </span>
            <input
              type="date"
              className="os-well os-font-mono rounded-lg px-2.5 py-2 text-[13px]"
              style={inputStyle}
              value={date}
              disabled={pending}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="os-font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-subtle)' }}>
              Limit (max {MAX_LIMIT.toLocaleString()})
            </span>
            <input
              type="number"
              min={1}
              max={MAX_LIMIT}
              className="os-well os-font-mono rounded-lg px-2.5 py-2 text-[13px]"
              style={inputStyle}
              value={limit}
              disabled={pending}
              onChange={(e) => setLimit(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="os-font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-subtle)' }}>
              Messages / sec — base rate (max {MAX_RATE})
            </span>
            <input
              type="number"
              min={1}
              max={MAX_RATE}
              className="os-well os-font-mono rounded-lg px-2.5 py-2 text-[13px]"
              style={inputStyle}
              value={rate}
              disabled={pending}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
          <RunButton type="submit" disabled={pending}>
            {pending ? (
              <span className="flex items-center gap-2">
                <Spinner /> Starting…
              </span>
            ) : (
              'Start Replay'
            )}
          </RunButton>
        </form>
      )}

      <p className="m-0 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
        {isActive
          ? 'The speed picker multiplies the base send rate live -- it doesn\'t change what was set when this replay started.'
          : 'Leave the date blank to replay the most recent day available in Silver.'}
      </p>

      {error && (
        <span className="os-font-mono text-[11.5px]" style={{ color: 'var(--danger)' }}>
          {error}
        </span>
      )}
    </Panel>
  );
}
