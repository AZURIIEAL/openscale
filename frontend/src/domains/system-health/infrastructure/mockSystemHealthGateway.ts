import type { SystemHealthGateway } from '../application/SystemHealthGateway';
import type { ServiceHealth } from '../domain/entities';
import { deriveOverallStatus } from '../domain/rules';

/**
 * Adapter: stands in for the future Go control-plane's
 * `GET /api/system-health` endpoint. Swapping to the real thing later means
 * writing an HttpSystemHealthGateway implementing the same port and
 * changing one line at the call site -- nothing in application/ or ui/
 * needs to change.
 */
const MOCK_SERVICES: ServiceHealth[] = [
  { id: 'minio', name: 'MinIO', status: 'good', running: true, detail: '4.1ms · lake@9000', consoleUrl: 'http://localhost:9101' },
  { id: 'kafka', name: 'Kafka', status: 'good', running: true, detail: '0 lag · 9092' },
  { id: 'postgres', name: 'Postgres', status: 'good', running: true, detail: '6.3ms · 5432' },
  { id: 'redis', name: 'Redis', status: 'good', running: true, detail: '0.9ms · 6379' },
  { id: 'prometheus', name: 'Prometheus', status: 'good', running: true, detail: 'up · scrape 5s', consoleUrl: 'http://localhost:9090' },
  { id: 'grafana', name: 'Grafana', status: 'good', running: true, detail: 'up · :3000', consoleUrl: 'http://localhost:3000' },
  { id: 'worker', name: 'Worker', status: 'good', running: true, detail: 'idle · job queue' },
  { id: 'jupyter', name: 'Jupyter', status: 'good', running: true, detail: 'up · :8888', consoleUrl: 'http://localhost:8888/lab?token=openscale-dev' },
  { id: 'mlflow', name: 'MLflow', status: 'good', running: true, detail: 'up · :5000', consoleUrl: 'http://localhost:5000' },
];

export const mockSystemHealthGateway: SystemHealthGateway = {
  async fetchSummary() {
    return {
      services: MOCK_SERVICES,
      overallStatus: deriveOverallStatus(MOCK_SERVICES),
    };
  },
};
