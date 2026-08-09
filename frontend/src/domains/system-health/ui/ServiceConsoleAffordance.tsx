import { LinkIcon } from '@/shared/design-system/LinkIcon';
import { BrokenHeartIcon } from '@/shared/design-system/BrokenHeartIcon';
import type { ServiceHealth } from '../domain/entities';

/**
 * Inline hint next to a service name for what its console link does right
 * now: nothing (no consoleUrl at all -- Kafka, Postgres, Redis), a working
 * link (chain icon, brightens on hover), or a link that exists but can't be
 * opened right now because the service is down (broken heart -- static, no
 * hover tooltip; the detail line under the name already says why).
 */
export function ServiceConsoleAffordance({ service }: { service: ServiceHealth }) {
  if (!service.consoleUrl) return null;

  if (service.status === 'crit') {
    return <BrokenHeartIcon className="text-[var(--crit)]" />;
  }

  return <LinkIcon className="text-[var(--ink-faint)] transition-colors group-hover:text-[var(--accent)]" />;
}
