import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Panel } from '@/shared/design-system/Panel';
import { useSavedQueries } from '@/domains/sql-editor/application/useSavedQueries';
import { useQueryTarget } from '@/domains/sql-editor/application/useQueryTarget';
import { httpQueryGateway } from '@/domains/sql-editor/infrastructure/httpQueryGateway';
import { isQueryError } from '@/domains/sql-editor/domain/rules';
import type { SavedQuery } from '@/domains/sql-editor/domain/entities';
import { chartPoints, formatCount } from '../domain/rules';
import { ChartPanel } from './ChartPanel';
import { BarChart } from './charts/BarChart';
import { HorizontalBarChart } from './charts/HorizontalBarChart';
import { TrendChart } from './charts/TrendChart';

/**
 * A project's dashboard: one tile per saved query with a chart, each run
 * through the project's query endpoint when the screen opens. Saving a
 * query with a chart in the SQL Editor is how a tile is added.
 */
export function SavedQueriesDashboard() {
  const saved = useSavedQueries();
  const tiles = (saved.data ?? []).filter((q) => q.chart);

  if (saved.isError) {
    return (
      <div className="text-sm" style={{ color: 'var(--danger)' }}>
        Failed to load saved queries. Is the control-plane running?
      </div>
    );
  }
  if (saved.isSuccess && tiles.length === 0) {
    return (
      <Panel className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        No charts yet. In the <Link to="../sql-editor">SQL Editor</Link>, run a query, pick a chart and save it: it shows up here.
      </Panel>
    );
  }
  // Numbers first, as a headline row, then the charts.
  const numbers = tiles.filter((q) => q.chart?.type === 'number');
  const charts = tiles.filter((q) => q.chart?.type !== 'number');
  return (
    <div className="flex flex-col gap-4">
      {numbers.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {numbers.map((q) => (
            <Tile key={q.id} query={q} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {charts.map((q) => (
          <Tile key={q.id} query={q} />
        ))}
      </div>
    </div>
  );
}

function Tile({ query }: { query: SavedQuery }) {
  const target = useQueryTarget();
  const chart = query.chart!;
  const run = useQuery({
    queryKey: ['dashboards', target.projectSlug, 'tile', query.name, query.sql],
    queryFn: () => httpQueryGateway.runQuery(target, query.sql),
    staleTime: 60_000,
  });
  const title = query.name.replace(/_/g, ' ');

  let body: ReactNode;
  let points: { label: string; value: number }[] = [];
  let problem = run.isError ? run.error.message : run.data && isQueryError(run.data) ? run.data.error : undefined;
  if (!problem && run.data && !isQueryError(run.data)) {
    try {
      points = chartPoints(run.data, chart);
    } catch (e) {
      problem = (e as Error).message;
    }
  }
  if (problem) {
    body = (
      <p className="os-font-mono m-0 text-[12px]" style={{ color: 'var(--danger)' }}>
        {problem}
      </p>
    );
  } else if (run.isPending) {
    body = <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Running…</p>;
  } else if (chart.type === 'line') {
    body = <TrendChart points={points} valueFormatter={formatCount} />;
  } else if (chart.type === 'bar') {
    body = <BarChart points={points} valueFormatter={formatCount} labelStride={points.length > 12 ? 3 : 1} />;
  } else if (chart.type === 'hbar') {
    body = <HorizontalBarChart points={points} valueFormatter={formatCount} />;
  }

  if (chart.type === 'number') {
    return (
      <ChartPanel title={title} value={problem || run.isPending ? undefined : formatCount(points[0]?.value)}>
        {(problem || run.isPending) && body}
      </ChartPanel>
    );
  }
  return <ChartPanel title={title}>{body}</ChartPanel>;
}
