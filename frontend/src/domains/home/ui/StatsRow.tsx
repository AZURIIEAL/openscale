import { Panel } from '@/shared/design-system/Panel';
import type { HomeStat } from '../domain/entities';

export function StatsRow({ stats }: { stats: HomeStat[] }) {
  return (
    <div className="mb-4 grid grid-cols-4 gap-3.5">
      {stats.map((stat) => (
        <Panel key={stat.id} size="sm" className="px-[18px] py-4">
          <div className="os-font-display os-tabular-nums text-[25px]">{stat.value}</div>
          <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
            {stat.label}
          </div>
        </Panel>
      ))}
    </div>
  );
}
