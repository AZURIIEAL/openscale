import { apiGet, apiPut } from '@/shared/api/httpClient';
import type { AppearanceSnapshot } from '@/app/theme-store';
import type { AppearanceGateway } from '../application/AppearanceGateway';

/**
 * Real adapter: calls the Go control-plane's GET/PUT /api/appearance-settings,
 * which reads/writes the single global appearance row (see
 * control-plane/internal/db/appearance_settings.go) -- this tool has no
 * per-user auth, so it's one shared row, not one per user.
 */
export const httpAppearanceGateway: AppearanceGateway = {
  fetchSettings() {
    return apiGet<AppearanceSnapshot>('/api/appearance-settings');
  },
  saveSettings(settings) {
    return apiPut<AppearanceSnapshot>('/api/appearance-settings', settings);
  },
};
