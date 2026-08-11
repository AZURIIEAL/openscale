import type { AppearanceSnapshot } from '@/app/theme-store';

/** Port -- see system-health/application/SystemHealthGateway.ts for the
 * same pattern explained in full. */
export interface AppearanceGateway {
  fetchSettings(): Promise<AppearanceSnapshot>;
  saveSettings(settings: AppearanceSnapshot): Promise<AppearanceSnapshot>;
}
