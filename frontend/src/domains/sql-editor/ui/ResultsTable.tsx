import { Panel } from '@/shared/design-system/Panel';
import { buildCsv, formatCellValue, formatDurationMs, isNumericCell } from '../domain/rules';
import type { QueryResult } from '../domain/entities';

/** Client-side CSV export -- builds the blob from the current result set
 * and triggers a download via a temporary anchor. No backend involved. */
function downloadCsv(result: QueryResult) {
  const csv = buildCsv(result.columns, result.rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `openscale-query-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Dynamic-column results grid -- columns aren't known ahead of time,
 * unlike this app's other bespoke tables, so headers/cells render straight
 * from the query response. Numeric columns get the same os-tabular-nums
 * right-alignment treatment as JobRunsTable/RecentRunsTable. */
export function ResultsTable({ result }: { result: QueryResult }) {
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="os-font-mono os-tabular-nums text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {result.rowCount.toLocaleString()} row{result.rowCount === 1 ? '' : 's'} · {formatDurationMs(result.durationMs)}
          {result.truncated ? ' · results truncated at 500 rows' : ''}
        </span>
        <button
          type="button"
          disabled={result.rows.length === 0}
          className="text-[12px] font-semibold"
          style={{
            background: 'none',
            border: 'none',
            cursor: result.rows.length === 0 ? 'default' : 'pointer',
            padding: 0,
            color: 'var(--accent)',
            opacity: result.rows.length === 0 ? 0.5 : 1,
          }}
          onClick={() => downloadCsv(result)}
        >
          Export CSV
        </button>
      </div>
      {result.rows.length === 0 ? (
        <p className="m-0 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Query succeeded with no rows returned.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: 'var(--surface-sunken)' }}>
                {result.columns.map((col, i) => (
                  <th
                    key={`${col}-${i}`}
                    className="os-font-mono text-left"
                    style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`os-font-mono px-3 py-2 text-[12.5px] ${isNumericCell(cell) ? 'os-tabular-nums text-right' : 'text-left'}`}
                      style={{
                        borderTop: '1px solid var(--border-subtle)',
                        color: cell === null || cell === undefined ? 'var(--text-subtle)' : 'var(--text-body)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatCellValue(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
