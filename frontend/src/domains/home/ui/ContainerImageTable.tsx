import { Panel } from '@/shared/design-system/Panel';
import type { ContainerResourceStat } from '../domain/entities';
import { formatGiB } from '../domain/rules';

function formatMiB(bytes: number): string {
  return (bytes / 1024 ** 2).toFixed(0);
}

export function ContainerImageTable({ containers }: { containers: ContainerResourceStat[] }) {
  const sorted = [...containers].sort((a, b) => b.memUsageBytes - a.memUsageBytes);

  return (
    <div>
      <div className="os-font-mono mb-2.5 ml-0.5 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-muted)' }}>
        Per-image usage — live
      </div>
      <Panel className="overflow-x-auto p-1.5">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr>
              {['Image', 'Container', 'CPU', 'Memory'].map((h) => (
                <th
                  key={h}
                  className="os-font-mono px-3.5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td className="os-font-mono px-3.5 py-3 text-[13px]" style={{ color: 'var(--ink-muted)' }} colSpan={4}>
                  No running containers found.
                </td>
              </tr>
            ) : (
              sorted.map((c) => (
                <tr key={c.id}>
                  <td className="os-font-mono px-3.5 py-2.5 text-[13px]" style={{ borderTop: '1px solid var(--hairline)' }}>
                    {c.image}
                  </td>
                  <td
                    className="os-font-mono px-3.5 py-2.5 text-[13px]"
                    style={{ borderTop: '1px solid var(--hairline)', color: 'var(--ink-muted)' }}
                  >
                    {c.name}
                  </td>
                  <td
                    className="os-font-mono os-tabular-nums px-3.5 py-2.5 text-[13px]"
                    style={{ borderTop: '1px solid var(--hairline)' }}
                  >
                    {c.cpuPercent.toFixed(1)}%
                  </td>
                  <td
                    className="os-font-mono os-tabular-nums px-3.5 py-2.5 text-[13px]"
                    style={{ borderTop: '1px solid var(--hairline)' }}
                  >
                    {formatMiB(c.memUsageBytes)} MB
                    {c.memLimitBytes > 0 ? (
                      <span style={{ color: 'var(--ink-faint)' }}> / {formatGiB(c.memLimitBytes)} GB</span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
