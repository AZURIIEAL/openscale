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

/** The Kafka topic a project's dataset streams to; mirrors the worker's
 * stream_dataset.topic_name and the control-plane's ProjectTopicPrefix. */
export function datasetTopic(projectSlug: string, dataset: string): string {
  return `${projectSlug}.${dataset}`;
}

/** Column names for the live feed table: the keys of the newest object
 * messages, in first-seen order, capped so a wide row stays readable. */
export function feedColumns(values: unknown[], max = 8): string[] {
  const seen: string[] = [];
  for (const v of values) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const key of Object.keys(v)) if (!seen.includes(key)) seen.push(key);
    }
    if (seen.length >= max) break;
  }
  return seen.slice(0, max);
}
