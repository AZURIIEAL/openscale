import { Panel } from '@/shared/design-system/Panel';
import { jupyterUrl } from '../config';

/**
 * Real, but thin: JupyterLab itself (a new docker-compose service) does
 * all the actual notebook work -- this screen is just an iframe pointed at
 * it, filling the page. JupyterLab's own file browser (visible inside the
 * iframe) is what the user picks a notebook from -- no separate OpenScale
 * sidebar duplicating that list. The 3 notebooks are copies of
 * etl-exposure's own (physically copied into notebooks/, not mounted from
 * etl-exposure/ -- the platform never references that directory).
 */
export function NotebooksScreen() {
  return (
    <Panel className="overflow-hidden p-2" style={{ height: 'calc(100vh - 130px)' }}>
      <iframe src={jupyterUrl()} title="Jupyter" className="h-full w-full rounded-[14px] border-0" />
    </Panel>
  );
}
