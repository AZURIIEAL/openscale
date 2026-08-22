import { useState } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { Well } from '@/shared/design-system/Well';
import { Spinner } from '@/shared/design-system/Spinner';
import { useLakeCatalog } from '../application/useLakeCatalog';
import { formatBytes, formatLastModified } from '../domain/rules';
import type { LakeLayer } from '../domain/entities';

function LayerRow({ layer }: { layer: LakeLayer }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Well className="flex flex-col gap-2 px-4 py-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? `Collapse ${layer.name}` : `Expand ${layer.name}`}
        className="flex w-full items-center justify-between gap-2 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span style={{ color: 'var(--text-subtle)', fontSize: 10 }}>{expanded ? '▾' : '▸'}</span>
          <span className="os-font-mono truncate text-[13px] font-semibold" style={{ color: 'var(--text-body)' }}>
            {layer.name}
          </span>
        </span>
        <span className="os-font-mono os-tabular-nums flex-shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {layer.objectCount} object{layer.objectCount === 1 ? '' : 's'} · {formatBytes(layer.totalBytes)}
        </span>
      </button>
      <p className="os-font-mono m-0 truncate text-[10.5px]" style={{ color: 'var(--text-subtle)' }}>
        {layer.prefix}
      </p>

      {expanded &&
        (layer.objects.length === 0 ? (
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-subtle)' }}>
            No objects yet -- run the matching job from Pipelines to populate this layer.
          </p>
        ) : (
          <div className="ml-5 flex flex-col gap-1 border-l pl-3" style={{ borderColor: 'var(--border-subtle)' }}>
            {layer.objects.map((obj) => (
              <div key={obj.key} className="flex flex-wrap items-center justify-between gap-2">
                <span className="os-font-mono min-w-0 flex-1 truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {obj.key}
                </span>
                <span className="os-font-mono os-tabular-nums flex-shrink-0 text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                  {formatBytes(obj.sizeBytes)} · {formatLastModified(obj.lastModified)}
                </span>
              </div>
            ))}
          </div>
        ))}
    </Well>
  );
}

/**
 * MinIO lake side of the Data Catalog -- the seven known lake prefixes
 * (Bronze, Silver, Silver quarantine, and the four Gold sub-layers) with
 * real object counts, byte sizes, and last-modified times straight from
 * MinIO's own listing (GET /api/catalog/lake). No row counts here --
 * there's no row-count tracking for the lake anywhere in this app (Gold's
 * write path skips it to avoid a full-dataset Spark scan), so this
 * honestly shows only what MinIO's listing actually provides. Four
 * distinct states, mirroring streaming's TopicsPanel exactly: loading,
 * control-plane unreachable, MinIO itself unreachable, and empty.
 */
export function LakeBrowserPanel() {
  const { data, isLoading, isError } = useLakeCatalog();

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="os-font-mono m-0 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-subtle)' }}>
          Lake (MinIO)
        </h3>
        <p className="m-0 mt-1.5 text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>
          Raw Bronze/Silver/Gold Parquet in the openscale-lake bucket -- real object listings, not a queryable view.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <Spinner /> Loading lake inventory…
        </div>
      ) : isError || !data ? (
        <div className="text-[12px]" style={{ color: 'var(--danger)' }}>
          Failed to load lake inventory. Is the control-plane running?
        </div>
      ) : !data.reachable ? (
        <div className="text-[12px]" style={{ color: 'var(--danger)' }}>
          MinIO unreachable -- the object store isn't responding. Check the openscale-minio container.
        </div>
      ) : data.layers.every((layer) => layer.objectCount === 0) ? (
        <div className="text-[12px]" style={{ color: 'var(--text-subtle)' }}>
          The lake is empty -- run jobs from Pipelines to populate Bronze, Silver, and Gold.
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: 520 }}>
          {data.layers.map((layer) => (
            <LayerRow key={layer.name} layer={layer} />
          ))}
        </div>
      )}
    </Panel>
  );
}
