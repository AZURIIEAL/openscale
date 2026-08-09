import { ComingSoon } from '@/shared/design-system/ComingSoon';

export function StreamingScreen() {
  return (
    <ComingSoon
      screenName="Streaming"
      description="Live Kafka topic view, windowed aggregates, and the replay tool. Needs a WebSocket feed from the control-plane."
    />
  );
}
