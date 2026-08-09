import type { Status } from '@/shared/types/status';
import type { ServiceHealth } from './entities';

/**
 * Worst-status-wins: one crit service makes the whole system crit, one warn
 * (with no crit) makes it warn. Pure function, no framework/IO dependency --
 * this is the kind of rule that belongs in domain/, not scattered across
 * whichever component happens to render it first.
 */
export function deriveOverallStatus(services: ServiceHealth[]): Status {
  if (services.some((s) => s.status === 'crit')) return 'crit';
  if (services.some((s) => s.status === 'warn')) return 'warn';
  return 'good';
}

/**
 * Services with a console to open are more actionable, so they lead the
 * list; everything else keeps its original (backend-defined) order behind
 * them. Array.prototype.sort is spec-stable, so ties don't reshuffle.
 */
export function sortServicesForDisplay(services: ServiceHealth[]): ServiceHealth[] {
  return [...services].sort((a, b) => Number(Boolean(b.consoleUrl)) - Number(Boolean(a.consoleUrl)));
}
