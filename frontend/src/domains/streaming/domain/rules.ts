/** Short clock-time label for a window tick's x-axis -- e.g. "3:41:08 PM".
 * Falls back to the raw string if it doesn't parse (shouldn't happen --
 * the control-plane always sends a real RFC3339 timestamp). */
export function formatWindowTickLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}

/** Short clock-time label for a trip event's pickup time in the live feed. */
export function formatPickupTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}
