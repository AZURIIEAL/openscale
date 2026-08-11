/**
 * No domain/application/infrastructure split here -- there's no I/O to
 * abstract behind a port, just a URL builder pointed at the embedded
 * Jupyter container. JupyterLab's own file browser (visible inside the
 * iframe) is what lets the user pick a notebook -- no need to duplicate
 * that list on the OpenScale side.
 */
const JUPYTER_BASE_URL = import.meta.env.VITE_JUPYTER_BASE_URL ?? 'http://localhost:8888';
const JUPYTER_TOKEN = import.meta.env.VITE_JUPYTER_TOKEN ?? 'openscale-dev';

export function jupyterUrl(): string {
  return `${JUPYTER_BASE_URL}/lab?token=${JUPYTER_TOKEN}`;
}
