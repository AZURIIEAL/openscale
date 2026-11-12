import { describe, expect, it } from 'vitest';
import { deriveOverallStatus, sortServicesForDisplay } from './rules';
import type { ServiceHealth } from './entities';

const svc = (id: string, status: ServiceHealth['status'], consoleUrl?: string): ServiceHealth =>
  ({ id, name: id, status, detail: '', running: true, consoleUrl }) as ServiceHealth;

describe('deriveOverallStatus', () => {
  it('is good when empty or all good', () => {
    expect(deriveOverallStatus([])).toBe('good');
    expect(deriveOverallStatus([svc('a', 'good')])).toBe('good');
  });
  it('worst status wins', () => {
    expect(deriveOverallStatus([svc('a', 'good'), svc('b', 'warn')])).toBe('warn');
    expect(deriveOverallStatus([svc('a', 'warn'), svc('b', 'crit'), svc('c', 'good')])).toBe('crit');
  });
});

describe('sortServicesForDisplay', () => {
  it('puts services with a console first and keeps the rest in order', () => {
    const sorted = sortServicesForDisplay([svc('kafka', 'good'), svc('grafana', 'good', 'http://g'), svc('redis', 'good'), svc('minio', 'good', 'http://m')]);
    expect(sorted.map((s) => s.id)).toEqual(['grafana', 'minio', 'kafka', 'redis']);
  });
  it('does not mutate its input', () => {
    const input = [svc('a', 'good'), svc('b', 'good', 'http://b')];
    sortServicesForDisplay(input);
    expect(input.map((s) => s.id)).toEqual(['a', 'b']);
  });
});
