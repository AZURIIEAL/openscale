import { Panel } from '@/shared/design-system/Panel';
import { mlflowUrl } from '../config';

/**
 * Real, but thin: MLflow itself (a new docker-compose service, running
 * `mlflow server` against the same tracking store the worker's `train` job
 * already writes to) does all the actual experiment-tracking work -- this
 * screen is just an iframe pointed at it, filling the page. Same pattern as
 * notebooks/ui/NotebooksScreen.tsx for Jupyter.
 */
export function MlWorkbenchScreen() {
  return (
    <Panel className="overflow-hidden p-2" style={{ height: 'calc(100vh - 130px)' }}>
      <iframe src={mlflowUrl()} title="MLflow" className="h-full w-full rounded-[14px] border-0" />
    </Panel>
  );
}
