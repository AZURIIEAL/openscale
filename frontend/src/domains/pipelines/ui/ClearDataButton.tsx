import { useEffect, useState } from 'react';
import { useTriggerJob } from '../application/useTriggerJob';

const CONFIRM_TIMEOUT_MS = 4000;

interface ClearDataButtonProps {
  onRunStarted: (runId: string) => void;
}

/**
 * Wipes everything earlier pipeline stages produced -- Gold/feature tables
 * in Postgres, the online feature snapshot in Redis, and the Bronze/Silver/
 * Gold objects in MinIO -- by triggering the 'reset' job type. That type is
 * deliberately absent from JOB_CATALOG so it never appears as a normal
 * pipeline stage; this is its only entry point. Same arm-then-confirm
 * interaction as JobRunsTable's ClearHistoryButton (click once to arm,
 * click again within a few seconds to confirm) since this is destructive
 * and irreversible.
 */
export function ClearDataButton({ onRunStarted }: ClearDataButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const { mutate, isPending } = useTriggerJob();

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <button
      type="button"
      disabled={isPending}
      className="os-font-mono text-[11px] font-semibold uppercase tracking-[0.06em]"
      style={{
        background: 'none',
        border: 'none',
        cursor: isPending ? 'default' : 'pointer',
        padding: 0,
        color: confirming ? 'var(--crit)' : 'var(--ink-muted)',
      }}
      onClick={() => {
        if (confirming) {
          setConfirming(false);
          mutate({ jobType: 'reset', params: {} }, { onSuccess: (run) => onRunStarted(run.id) });
        } else {
          setConfirming(true);
        }
      }}
    >
      {isPending ? 'Clearing data…' : confirming ? 'Confirm clear data?' : 'Clear data (Postgres + MinIO)'}
    </button>
  );
}
