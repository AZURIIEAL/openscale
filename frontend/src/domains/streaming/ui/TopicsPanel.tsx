import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import { Spinner } from '@/shared/design-system/Spinner';
import { useKafkaTopics } from '../application/useKafkaTopics';

/** Kafka topic admin snapshot -- real, live counts from GET
 * /api/streaming/topics (polled every 5s), not a mocked/hardcoded list.
 * Three distinct empty states: still loading, the control-plane itself is
 * unreachable, and the control-plane is up but Kafka isn't (brokerReachable
 * is false) -- each needs a different honest message. */
export function TopicsPanel() {
  const { data, isLoading, isError } = useKafkaTopics();

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <h3 className="os-font-mono m-0 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-subtle)' }}>
        Kafka Topics
      </h3>

      {isLoading ? (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <Spinner /> Loading topics…
        </div>
      ) : isError || !data ? (
        <div className="text-[12px]" style={{ color: 'var(--danger)' }}>
          Failed to load topics. Is the control-plane running?
        </div>
      ) : !data.brokerReachable ? (
        <div className="text-[12px]" style={{ color: 'var(--danger)' }}>
          Kafka unreachable -- the broker isn't responding. Check the openscale-kafka container.
        </div>
      ) : data.topics.length === 0 ? (
        <div className="text-[12px]" style={{ color: 'var(--text-subtle)' }}>
          Kafka has no topics yet -- start a replay below to create yellow-taxi-trips.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.topics.map((topic) => (
            <Well key={topic.name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <span className="os-font-mono text-[12.5px] font-semibold" style={{ color: 'var(--text-body)' }}>
                {topic.name}
              </span>
              <span className="os-font-mono os-tabular-nums text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {topic.partitions} partition{topic.partitions === 1 ? '' : 's'} · {topic.messageCount.toLocaleString()} messages
              </span>
            </Well>
          ))}
        </div>
      )}
    </Panel>
  );
}
