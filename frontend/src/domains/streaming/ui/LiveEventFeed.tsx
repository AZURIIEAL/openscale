import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import { formatCurrency } from '@/domains/dashboards/domain/rules';
import { formatPickupTime } from '../domain/rules';
import type { TripEvent } from '../domain/entities';

/** Scrolling list of the most recent live trip events, most-recent-first
 * -- fed entirely by useLiveTripStream's real WebSocket state, nothing
 * fabricated here. Empty until the first trip frame arrives. */
export function LiveEventFeed({ trips }: { trips: TripEvent[] }) {
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <h3 className="os-font-mono m-0 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-subtle)' }}>
        Live Trips
      </h3>

      {trips.length === 0 ? (
        <p className="m-0 text-[12px] leading-snug" style={{ color: 'var(--text-subtle)' }}>
          No trip events yet -- start a replay above to see live trips here.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 overflow-y-auto pr-1" style={{ maxHeight: 380 }}>
          {trips.map((trip, i) => (
            <Well key={`${trip.pickupAt}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <span className="os-font-mono text-[11.5px]" style={{ color: 'var(--text-subtle)', minWidth: 88 }}>
                {formatPickupTime(trip.pickupAt)}
              </span>
              <span className="os-font-mono text-[12px]" style={{ color: 'var(--text-body)' }}>
                zone {trip.pickupLocationId} → {trip.dropoffLocationId}
              </span>
              <span className="os-font-mono os-tabular-nums text-[12px]" style={{ color: 'var(--text-muted)' }}>
                {trip.tripDistanceMiles.toFixed(1)} mi
              </span>
              <span className="os-font-mono os-tabular-nums text-[12px] font-semibold" style={{ color: 'var(--text-heading)' }}>
                {formatCurrency(trip.fareAmount)}
              </span>
            </Well>
          ))}
        </div>
      )}
    </Panel>
  );
}
