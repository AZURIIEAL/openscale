import { useState } from 'react';
import { Led } from '@/shared/design-system/Led';
import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import type { Status } from '@/shared/types/status';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { ActionButton } from '@/domains/datasets/ui/ActionButton';
import { TrendChart } from '@/domains/dashboards/ui/charts/TrendChart';
import { useJobCatalog } from '@/domains/pipelines/application/useJobCatalog';
import { useJobRunEvents } from '@/domains/pipelines/application/useJobRunEvents';
import { useTriggerJob } from '@/domains/pipelines/application/useTriggerJob';
import { RunJobForm } from '@/domains/pipelines/ui/RunJobForm';
import { useJobControl } from '../application/useJobControl';
import { useProjectTopics, useTopicTail } from '../application/useProjectStream';
import type { ConnectionStatus } from '../domain/entities';
import { datasetTopic, feedColumns, formatWindowTickLabel } from '../domain/rules';

const STATUS_LED: Record<ConnectionStatus, Status> = { connecting: 'warn', live: 'good', disconnected: 'crit' };
const headingClass = 'os-font-mono m-0 text-[11px] font-semibold uppercase tracking-[0.08em]';

/**
 * Streaming for any project: the stream_dataset job sends a dataset's rows
 * to the topic `{project}.{dataset}`, and this screen tails whichever of the
 * project's topics is selected, live over WebSocket.
 */
export function ProjectStreamingScreen() {
  const { slug } = useCurrentProject();
  const topics = useProjectTopics();
  const catalog = useJobCatalog();
  const trigger = useTriggerJob();
  const control = useJobControl();
  const [picked, setPicked] = useState<string>();
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const { state } = useJobRunEvents(activeJob);
  const running = activeJob !== null && (state === 'queued' || state === 'running');

  const topicList = topics.data?.topics ?? [];
  const topic = picked ?? topicList[0]?.name;
  const tail = useTopicTail(topic);
  const schema = catalog.data?.find((j) => j.type === 'stream_dataset')?.paramsSchema;
  const columns = feedColumns(tail.messages.map((m) => m.value));

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>Stream a dataset</h3>
            <p className="text-wrap-pretty" style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Sends a dataset's rows, one JSON message each, to the Kafka topic <span className="os-font-mono">{slug}.&lt;dataset&gt;</span> at a set rate.
            </p>
          </div>
          {running && (
            <div className="flex items-center gap-2">
              <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                {paused ? 'Paused' : 'Streaming…'}
              </span>
              <ActionButton
                onClick={() =>
                  control.mutate({ jobId: activeJob, action: paused ? 'resume' : 'pause' }, { onSuccess: () => setPaused(!paused) })
                }
              >
                {paused ? 'Resume' : 'Pause'}
              </ActionButton>
              <ActionButton danger onClick={() => control.mutate({ jobId: activeJob, action: 'cancel' })}>
                Stop
              </ActionButton>
            </div>
          )}
        </div>
        {schema && !running && (
          <RunJobForm
            schema={schema}
            pending={trigger.isPending}
            submitLabel="Start stream"
            onSubmit={(params) =>
              trigger.mutate(
                { jobType: 'stream_dataset', params },
                {
                  onSuccess: (run) => {
                    setActiveJob(run.id);
                    setPaused(false);
                    setPicked(datasetTopic(slug, String(params.dataset)));
                  },
                },
              )
            }
          />
        )}
        {(trigger.error ?? control.error) && (
          <p className="m-0 text-[12px]" style={{ color: 'var(--danger)' }}>
            {(trigger.error ?? control.error)!.message.replace(/^\w+ \S+ failed: \d+ /, '')}
          </p>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel className="flex flex-col gap-3 p-4">
          <h3 className={headingClass} style={{ color: 'var(--text-subtle)' }}>
            Topics
          </h3>
          {topics.data && !topics.data.brokerReachable ? (
            <p className="m-0 text-[12px]" style={{ color: 'var(--danger)' }}>
              Kafka isn't responding. Check the openscale-kafka container.
            </p>
          ) : topicList.length === 0 ? (
            <p className="m-0 text-[12px]" style={{ color: 'var(--text-subtle)' }}>
              No topics yet. Stream a dataset to create one.
            </p>
          ) : (
            topicList.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => setPicked(t.name)}
                aria-pressed={t.name === topic}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                <Well
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                  style={t.name === topic ? { outline: '1.5px solid var(--brand)' } : undefined}
                >
                  <span className="os-font-mono text-[12.5px] font-semibold" style={{ color: 'var(--text-body)' }}>
                    {t.name}
                  </span>
                  <span className="os-font-mono os-tabular-nums text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {t.messageCount.toLocaleString()} messages
                  </span>
                </Well>
              </button>
            ))
          )}
        </Panel>
        <Panel className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className={headingClass} style={{ color: 'var(--text-subtle)' }}>
              Messages / sec
            </h3>
            {topic && (
              <span className="os-font-mono flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <Led status={STATUS_LED[tail.status]} label={`Tail ${tail.status}`} />
                {tail.status === 'live' ? `live: ${topic}` : tail.status}
              </span>
            )}
          </div>
          <TrendChart
            points={tail.windows.map((w) => ({ label: formatWindowTickLabel(w.at), value: w.messagesPerSecond }))}
            height={120}
            valueFormatter={(v) => `${v.toFixed(1)}/s`}
          />
        </Panel>
      </div>

      <Panel className="flex flex-col gap-3 p-4">
        <h3 className={headingClass} style={{ color: 'var(--text-subtle)' }}>
          Live messages {topic ? `· ${topic}` : ''}
        </h3>
        {tail.messages.length === 0 ? (
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-subtle)' }}>
            {topic ? 'Waiting for new messages on this topic…' : 'Pick a topic to watch.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="os-font-mono w-full text-left text-[12px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-subtle)' }}>
                  <th className="py-1 pr-3 font-semibold">offset</th>
                  {columns.length > 0 ? columns.map((c) => <th key={c} className="py-1 pr-3 font-semibold">{c}</th>) : <th className="py-1 font-semibold">value</th>}
                </tr>
              </thead>
              <tbody>
                {tail.messages.map((m) => (
                  <tr key={m.offset} style={{ color: 'var(--text-body)', borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="os-tabular-nums py-1 pr-3" style={{ color: 'var(--text-muted)' }}>
                      {m.offset}
                    </td>
                    {columns.length > 0 ? (
                      columns.map((c) => (
                        <td key={c} className="max-w-[16rem] truncate py-1 pr-3">
                          {cell((m.value as Record<string, unknown> | null)?.[c])}
                        </td>
                      ))
                    ) : (
                      <td className="py-1">{cell(m.value)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
