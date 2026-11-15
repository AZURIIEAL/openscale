import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel } from '@/shared/design-system/Panel';
import { RunButton } from '@/shared/design-system/RunButton';
import { useCreateProject, useImportProject } from './useProjects';
import { isValidSlug, projectPath, slugify } from './rules';

const inputClass = 'os-well rounded-lg px-3 py-2 text-[13px] w-full';
const inputStyle = { background: 'transparent', border: 'none', color: 'var(--text-body)', outline: 'none' } as const;

/** /projects/new -- also where `/` lands when no project exists yet. */
export function NewProjectScreen() {
  const navigate = useNavigate();
  const create = useCreateProject();
  const importer = useImportProject();
  const [fileError, setFileError] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const slugOk = isValidSlug(effectiveSlug);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slugOk) return;
    create.mutate(
      { name: name.trim(), slug: effectiveSlug, description: description.trim() || undefined },
      { onSuccess: (project) => navigate(projectPath(project.slug), { replace: true }) },
    );
  }

  // A project file (an export, or samples/nyc_taxi/project.json). Name and
  // slug typed above win over the file's, so a file can be imported twice.
  async function onImport(file: File) {
    setFileError('');
    let bundle: { project?: Record<string, unknown> };
    try {
      bundle = JSON.parse(await file.text());
    } catch {
      setFileError(`${file.name} is not a JSON project file.`);
      return;
    }
    const project = { ...bundle.project };
    if (name.trim()) Object.assign(project, { name: name.trim(), slug: effectiveSlug });
    if (description.trim()) project.description = description.trim();
    importer.mutate({ ...bundle, project }, { onSuccess: (p) => navigate(projectPath(p.slug), { replace: true }) });
  }
  const importError = fileError || (importer.error?.message.replace(/^\w+ \S+ failed: \d+ /, '') ?? '');

  return (
    <Panel className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <div>
        <span className="os-font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--text-subtle)' }}>
          Projects
        </span>
        <h2 className="m-0 mt-1 text-lg" style={{ color: 'var(--text-heading)' }}>
          Create a project
        </h2>
        <p className="m-0 mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          A project holds its own datasets, runs, queries and dashboards. Pick a short name; the URL slug is derived from it.
        </p>
      </div>

      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1">
          <span className="os-font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-subtle)' }}>
            Name
          </span>
          <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus />
        </label>

        <label className="flex flex-col gap-1">
          <span className="os-font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-subtle)' }}>
            Slug
          </span>
          <input
            className={`${inputClass} os-font-mono`}
            style={inputStyle}
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            maxLength={48}
            spellCheck={false}
          />
          <span className="text-[12px]" style={{ color: slugOk || !effectiveSlug ? 'var(--text-muted)' : 'var(--danger)' }}>
            {effectiveSlug ? `/p/${effectiveSlug}` : 'lowercase letters, digits and hyphens'}
            {!slugOk && effectiveSlug ? ' — lowercase letters, digits and single hyphens only' : ''}
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="os-font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-subtle)' }}>
            Description (optional)
          </span>
          <textarea className={inputClass} style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </label>

        {create.isError && (
          <p className="m-0 text-[13px]" style={{ color: 'var(--danger)' }}>
            {create.error instanceof Error ? create.error.message : 'Could not create the project.'}
          </p>
        )}

        <div className="flex items-center gap-3">
          <RunButton type="submit" disabled={create.isPending || !name.trim() || !slugOk}>
            {create.isPending ? 'Creating…' : 'Create project'}
          </RunButton>
          <button type="button" className="text-[13px] underline" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-1 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <label className="flex flex-wrap items-center gap-3 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          <span>Or import a project file (an export, or the NYC Taxi sample in samples/nyc_taxi/project.json):</span>
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Import a project file"
            disabled={importer.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void onImport(file);
            }}
          />
        </label>
        {importer.isPending && <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Importing…</span>}
        {importError && (
          <p className="m-0 text-[13px]" style={{ color: 'var(--danger)' }}>
            {importError}
          </p>
        )}
      </div>
    </Panel>
  );
}
