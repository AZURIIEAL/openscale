/**
 * No domain/application/infrastructure split here -- same reasoning as
 * notebooks/config.ts: there's no I/O to abstract behind a port, just a URL
 * builder pointed at the embedded MLflow container. MLflow's own UI
 * (experiments, runs, model registry) is what the user browses inside the
 * iframe -- no need to duplicate any of that on the OpenScale side.
 */
const MLFLOW_BASE_URL = import.meta.env.VITE_MLFLOW_BASE_URL ?? 'http://localhost:5000';

export function mlflowUrl(): string {
  return MLFLOW_BASE_URL;
}
