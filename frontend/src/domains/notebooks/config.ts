/**
 * No domain/application/infrastructure split here -- there's no I/O to
 * abstract behind a port, just a URL builder pointed at the embedded
 * Jupyter container. JupyterLab's own file browser (visible inside the
 * iframe) is what lets the user pick a notebook -- no need to duplicate
 * that list on the OpenScale side.
 *
 * Same-origin by default: the dev server and the deploy gateway both proxy
 * /jupyter/ to the Jupyter container.
 */
const JUPYTER_BASE_URL = import.meta.env.VITE_JUPYTER_BASE_URL ?? '/jupyter';
const JUPYTER_TOKEN = import.meta.env.VITE_JUPYTER_TOKEN ?? 'openscale-dev';

export function jupyterUrl(): string {
  return `${JUPYTER_BASE_URL}/lab?token=${JUPYTER_TOKEN}`;
}
