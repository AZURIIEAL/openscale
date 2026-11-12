import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NAV_ENTRIES, navHref } from '@/shared/layout/navigation';
import { useCurrentProject } from '@/shared/project/useCurrentProject';
import { useProjectsList } from '@/shared/project/useProjects';
import { projectPath } from '@/shared/project/rules';
import { JOB_CATALOG } from '@/domains/pipelines/domain/entities';
import { stateLabel, formatRunTime } from '@/domains/pipelines/domain/rules';
import { httpJobsGateway } from '@/domains/pipelines/infrastructure/httpJobsGateway';
import { httpQueryGateway } from '@/domains/sql-editor/infrastructure/httpQueryGateway';
import { quotedTableRef } from '@/domains/data-catalog/domain/rules';
import { matchesQuery, MAX_RESULTS_PER_CATEGORY } from './rules';
import type { SearchResults } from './entities';

const EMPTY_RESULTS: SearchResults = { project: [], screen: [], job: [], table: [], run: [] };

/**
 * Search across everything this app already knows about, real data only:
 * the project list and static screen/job catalogs (no extra fetch), plus
 * the SQL Editor's table catalog and the current project's run history
 * (both existing endpoints, reused as-is). Screen, job and run results
 * open inside the current project; with no project in the URL they fall
 * back to `/` and its last-used redirect. The two network-backed
 * categories only fetch once the search bar actually has focus.
 */
export function useGlobalSearch(query: string, enabled: boolean): { results: SearchResults; isLoading: boolean; total: number } {
  const trimmed = query.trim();
  const active = enabled && trimmed.length > 0;
  const { slug } = useCurrentProject();
  const { data: projects } = useProjectsList();

  const catalogQuery = useQuery({
    queryKey: ['search', 'catalog'],
    queryFn: () => httpQueryGateway.fetchCatalog(),
    enabled,
    staleTime: 10 * 60 * 1000,
  });

  const runsQuery = useQuery({
    queryKey: ['search', slug, 'runs'],
    queryFn: () => httpJobsGateway.fetchRuns(slug, { limit: 50, offset: 0 }),
    enabled: enabled && slug !== '',
    staleTime: 30 * 1000,
  });

  const results = useMemo<SearchResults>(() => {
    if (!active) return EMPTY_RESULTS;
    const inProject = (subpath: string) => (slug ? projectPath(slug, subpath) : '/');

    const project = (projects ?? [])
      .filter((p) => matchesQuery(trimmed, p.name, p.slug, p.description))
      .slice(0, MAX_RESULTS_PER_CATEGORY)
      .map((p) => ({ id: `project:${p.slug}`, category: 'project' as const, title: p.name, subtitle: `/p/${p.slug}`, path: projectPath(p.slug) }));

    const screen = NAV_ENTRIES.filter((e) => matchesQuery(trimmed, e.label, e.subtitle))
      .slice(0, MAX_RESULTS_PER_CATEGORY)
      .map((e) => ({ id: `screen:${e.path}`, category: 'screen' as const, title: e.label, subtitle: e.subtitle, path: navHref(e, slug || undefined) }));

    const job = JOB_CATALOG.filter((j) => matchesQuery(trimmed, j.label, j.type, j.stage, j.description))
      .slice(0, MAX_RESULTS_PER_CATEGORY)
      .map((j) => ({
        id: `job:${j.type}`,
        category: 'job' as const,
        title: j.label,
        subtitle: j.description,
        path: inProject('pipelines'),
        navState: { openJobType: j.type },
      }));

    const table = (catalogQuery.data ?? [])
      .filter((t) => matchesQuery(trimmed, t.schema, t.table))
      .slice(0, MAX_RESULTS_PER_CATEGORY)
      .map((t) => ({
        id: `table:${t.schema}.${t.table}`,
        category: 'table' as const,
        title: `${t.schema}.${t.table}`,
        subtitle: `${t.columns.length} column${t.columns.length === 1 ? '' : 's'}`,
        path: inProject('sql-editor'),
        navState: { prefillSql: `select * from ${quotedTableRef(t.schema, t.table)} limit 20;` },
      }));

    const run = (runsQuery.data?.runs ?? [])
      .filter((r) => matchesQuery(trimmed, r.jobType, r.id, r.state))
      .slice(0, MAX_RESULTS_PER_CATEGORY)
      .map((r) => ({
        id: `run:${r.id}`,
        category: 'run' as const,
        title: `${r.jobType} · ${stateLabel(r.state)}`,
        subtitle: formatRunTime(r.submittedAt),
        path: inProject('pipelines'),
        navState: { selectedRunId: r.id },
      }));

    return { project, screen, job, table, run };
  }, [active, trimmed, slug, projects, catalogQuery.data, runsQuery.data]);

  const isLoading = active && (catalogQuery.isFetching || runsQuery.isFetching);
  const total = results.project.length + results.screen.length + results.job.length + results.table.length + results.run.length;

  return { results, isLoading, total };
}
