import type { SystemHealthSummary } from '../domain/entities';

/**
 * Port: what the application layer needs from the outside world, expressed
 * as an interface it owns -- infrastructure/ provides the implementation.
 * This is the Dependency Inversion piece: useSystemHealthSummary depends on
 * this abstraction, never on a concrete HTTP client or mock directly.
 */
export interface SystemHealthGateway {
  fetchSummary(): Promise<SystemHealthSummary>;
}
