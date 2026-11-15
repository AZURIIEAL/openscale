/**
 * No domain/application/infrastructure split here -- same reasoning as
 * notebooks/config.ts: there's no I/O to abstract behind a port, just a URL
 * builder pointed at the embedded MLflow container. MLflow's own UI
 * (experiments, runs, model registry) is what the user browses inside the
 * iframe -- no need to duplicate any of that on the OpenScale side.
 *
 * Same-origin by default: the dev server and the deploy gateway both proxy
 * /mlflow/ to the MLflow container.
 */
const MLFLOW_BASE_URL = import.meta.env.VITE_MLFLOW_BASE_URL ?? '/mlflow/';

export function mlflowUrl(): string {
  return MLFLOW_BASE_URL;
}
