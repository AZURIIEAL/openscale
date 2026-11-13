import { useLocation, useNavigate } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { useProjectsList } from './useProjects';
import { parseProjectPath, projectPath } from './rules';

const NEW_PROJECT_VALUE = '__new__';

/**
 * Top-bar project picker. Switching keeps the current screen (e.g. from
 * /p/a/pipelines to /p/b/pipelines); the project slug lives in the URL, so
 * refresh, deep links and the live-log WebSocket all keep working. A plain
 * <select> for now -- the same reasoning as RunJobForm's month pickers.
 */
export function ProjectSwitcher() {
  const { data: projects } = useProjectsList();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const parsed = parseProjectPath(pathname);
  const currentSlug = parsed?.slug ?? '';
  const subpath = parsed?.subpath ?? '';

  return (
    <label className="flex items-center gap-2" title="Switch project">
      <FolderOpen size={16} strokeWidth={1.75} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
      <select
        aria-label="Project"
        className="os-well os-font-mono rounded-lg px-2.5 py-1.5 text-[12.5px]"
        style={{ background: 'transparent', border: 'none', color: 'var(--text-body)', outline: 'none', maxWidth: 200 }}
        value={currentSlug}
        onChange={(e) => {
          const next = e.target.value;
          if (next === NEW_PROJECT_VALUE) navigate('/projects/new');
          else if (next) navigate(projectPath(next, subpath));
        }}
      >
        {!currentSlug && (
          <option value="" disabled>
            Select a project
          </option>
        )}
        {(projects ?? []).map((p) => (
          <option key={p.id} value={p.slug}>
            {p.name}
          </option>
        ))}
        <option value={NEW_PROJECT_VALUE}>+ New project…</option>
      </select>
    </label>
  );
}
