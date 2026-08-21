import { Panel } from '@/shared/design-system/Panel';
import type { ContainerResourceStat } from '../domain/entities';
import { formatGiB } from '../domain/rules';

function formatMiB(bytes: number): string {
  return (bytes / 1024 ** 2).toFixed(0);
}

export function ContainerImageTable({ containers }: { containers: ContainerResourceStat[] }) {
  const sorted = [...containers].sort((a, b) => b.memUsageBytes - a.memUsageBytes);

  return (
    <Panel>
      <header>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>Per-Image Usage</h3>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>Live container consumption</p>
      </header>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr style={{ background: 'var(--surface-sunken)' }}>
              {['Image', 'Container', 'CPU', 'Memory'].map((h) => (
                <th
                  key={h}
                  className="text-left"
                  style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td className="px-3.5 py-3 text-[13px]" style={{ color: 'var(--text-muted)' }} colSpan={4}>
                  No running containers found.
                </td>
              </tr>
            ) : (
              sorted.map((c) => (
                <tr key={c.id}>
                  <td className="os-font-mono px-3.5 py-3 text-[13px]" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    {c.image}
                  </td>
                  <td
                    className="os-font-mono px-3.5 py-3 text-[13px]"
                    style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                  >
                    {c.name}
                  </td>
                  <td
                    className="os-font-mono os-tabular-nums px-3.5 py-3 text-[13px]"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                  >
                    {c.cpuPercent.toFixed(1)}%
                  </td>
                  <td
                    className="os-font-mono os-tabular-nums px-3.5 py-3 text-[13px]"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                  >
                    {formatMiB(c.memUsageBytes)} MB
                    {c.memLimitBytes > 0 ? (
                      <span style={{ color: 'var(--text-subtle)' }}> / {formatGiB(c.memLimitBytes)} GB</span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
