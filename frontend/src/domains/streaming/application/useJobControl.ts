import { useMutation } from '@tanstack/react-query';
import { apiPost } from '@/shared/api/httpClient';
import { projectApiPath } from '@/shared/project/rules';
import { useCurrentProject } from '@/shared/project/useCurrentProject';

export type JobControlAction = 'pause' | 'resume' | 'cancel' | 'setSpeed';

interface JobControlParams {
  jobId: string;
  action: JobControlAction;
  speedMultiplier?: number;
}

/**
 * Live control for an in-flight job run -- POST /api/projects/{p}/jobs/{id}/control
 * (currently only meaningful to the `replay` job's send loop, see
 * worker/jobs/replay.py). Fire-and-report-error: unlike useTriggerJob,
 * there's no cache this affects (the control-plane doesn't echo pause/speed
 * state back over any channel the frontend already listens to), so no
 * onSuccess/invalidation -- ReplayControls tracks its own optimistic UI
 * state after a successful call.
 */
export function useJobControl() {
  const { slug } = useCurrentProject();
  return useMutation({
    mutationFn: ({ jobId, action, speedMultiplier }: JobControlParams) =>
      apiPost<{ ok: boolean }>(projectApiPath(slug, `jobs/${jobId}/control`), { action, speedMultiplier }),
  });
}
