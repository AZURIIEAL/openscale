import type { JobRun } from '../domain/entities';

/**
 * Port: the read half of the pipelines domain -- job run history.
 * infrastructure/ provides mock and http implementations.
 */
export interface JobsGateway {
  fetchRuns(): Promise<JobRun[]>;
}
