/**
 * Semantic status used across every domain (service health, job runs,
 * alerts...). Deliberately separate from the `accent` design token --
 * status color communicates state, accent communicates brand/interactivity.
 */
export type Status = 'good' | 'warn' | 'crit';
