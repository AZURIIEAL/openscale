import { Database, Calendar, Layers, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { StatCard } from '@/shared/design-system/StatCard';
import type { HomeStat } from '../domain/entities';

const STAT_ICON: Record<string, LucideIcon> = {
  'silver-rows': Database,
  months: Calendar,
  'gold-tables': Layers,
  'fare-mae': FileText,
};

/** The real HomeStat entity carries a label/value pair only -- no delta,
 * since the control-plane doesn't compute a period-over-period comparison
 * for these four figures. StatCard's delta pill is simply omitted here
 * rather than fabricated, unlike the redesign mockup's static mock data. */
export function StatsRow({ stats }: { stats: HomeStat[] }) {
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {stats.map((stat) => (
        <StatCard key={stat.id} label={titleCase(stat.label)} value={stat.value} icon={STAT_ICON[stat.id]} />
      ))}
    </div>
  );
}

function titleCase(label: string): string {
  return label.replace(/\b\w/g, (c) => c.toUpperCase());
}
