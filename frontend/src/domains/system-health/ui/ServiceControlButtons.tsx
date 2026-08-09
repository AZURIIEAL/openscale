import { IconButton } from '@/shared/design-system/IconButton';
import { RestartIcon } from '@/shared/design-system/RestartIcon';
import { PlayIcon } from '@/shared/design-system/PlayIcon';
import { StopIcon } from '@/shared/design-system/StopIcon';
import { useServiceControl } from '../application/useServiceControl';
import type { ServiceHealth } from '../domain/entities';

/**
 * Restart + start/stop controls for one service row. Each instance owns
 * its own mutation (via useServiceControl), so restarting Kafka doesn't
 * disable Redis's buttons -- state is per-row, not global.
 */
export function ServiceControlButtons({ service }: { service: ServiceHealth }) {
  const { mutate, isPending, variables } = useServiceControl();
  const pendingAction = isPending ? variables?.action : undefined;

  return (
    <div className="flex flex-shrink-0 items-center gap-1.5">
      <IconButton
        label={`Restart ${service.name}`}
        disabled={isPending}
        onClick={() => mutate({ serviceId: service.id, action: 'restart' })}
      >
        <RestartIcon className={pendingAction === 'restart' ? 'animate-spin' : undefined} />
      </IconButton>
      {service.running ? (
        <IconButton
          label={`Stop ${service.name}`}
          disabled={isPending}
          onClick={() => mutate({ serviceId: service.id, action: 'stop' })}
        >
          <StopIcon />
        </IconButton>
      ) : (
        <IconButton
          label={`Start ${service.name}`}
          disabled={isPending}
          onClick={() => mutate({ serviceId: service.id, action: 'start' })}
        >
          <PlayIcon />
        </IconButton>
      )}
    </div>
  );
}
