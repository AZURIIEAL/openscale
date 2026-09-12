import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useGlobalSearch } from '@/shared/search/useGlobalSearch';
import { CATEGORY_LABEL } from '@/shared/search/rules';
import type { SearchCategory, SearchResultItem } from '@/shared/search/entities';

const CATEGORY_ORDER: SearchCategory[] = ['screen', 'job', 'table', 'run'];

/**
 * The top bar's search field, plus its results dropdown -- real navigation,
 * not a cosmetic input. Searches four real sources: the static screen/job
 * catalogs and (once the field has focus) the SQL Editor's table catalog
 * and Pipelines' run history, both existing endpoints. Selecting a result
 * navigates there; table/job/run results also carry enough state for the
 * destination screen to land on the specific thing that matched (see
 * useGlobalSearch's navState per category) instead of just the right
 * screen in general.
 */
export function SearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { results, total } = useGlobalSearch(query, focused);
  const flat = useMemo<SearchResultItem[]>(
    () => CATEGORY_ORDER.flatMap((cat) => results[cat]),
    [results],
  );
  const open = focused && query.trim().length > 0;

  useEffect(() => setHighlighted(0), [query]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function select(item: SearchResultItem) {
    navigate(item.path, item.navState ? { state: item.navState } : undefined);
    setQuery('');
    setFocused(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setQuery('');
      e.currentTarget.blur();
      return;
    }
    if (!open || flat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(flat[highlighted]);
    }
  }

  return (
    <div ref={containerRef} className="relative hidden sm:flex" style={{ flex: 'none' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'text',
          width: focused || query ? 280 : 240,
          height: 36,
          boxSizing: 'border-box',
          background: 'var(--surface-card)',
          borderRadius: 999,
          padding: '0 10px 0 13px',
          border: `1px solid ${focused ? 'var(--brand)' : 'var(--border-subtle)'}`,
          boxShadow: focused ? '0 0 0 3px var(--ring-tint)' : 'var(--shadow-card)',
          transition:
            'width var(--dur-base) var(--ease-out), border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        <Search size={16} color="var(--text-subtle)" strokeWidth={1.75} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search screens, jobs, tables, runs"
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-core)',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--text-body)',
          }}
        />
        {!focused && !query && (
          <span className="os-kbd" style={{ flex: 'none' }}>
            ⌘K
          </span>
        )}
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              flex: 'none',
              padding: 0,
              border: 'none',
              borderRadius: 999,
              cursor: 'pointer',
              background: 'var(--surface-sunken)',
            }}
          >
            <X size={12} color="var(--text-muted)" />
          </button>
        )}
      </div>

      {open && (
        <div
          className="os-panel"
          style={{
            position: 'absolute',
            top: 44,
            right: 0,
            width: 340,
            maxHeight: 420,
            overflowY: 'auto',
            padding: 8,
            zIndex: 40,
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          {total === 0 ? (
            <p className="m-0 p-3 text-[12px]" style={{ color: 'var(--text-subtle)' }}>
              No matches for &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            CATEGORY_ORDER.filter((cat) => results[cat].length > 0).map((cat) => (
              <div key={cat} className="mb-2 last:mb-0">
                <div
                  className="os-font-mono px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: 'var(--text-subtle)' }}
                >
                  {CATEGORY_LABEL[cat]}
                </div>
                {results[cat].map((item) => {
                  const index = flat.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => select(item)}
                      onMouseEnter={() => setHighlighted(index)}
                      className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left"
                      style={{
                        border: 'none',
                        cursor: 'pointer',
                        background: index === highlighted ? 'var(--surface-sunken)' : 'transparent',
                      }}
                    >
                      <span className="truncate text-[13px] font-medium" style={{ color: 'var(--text-body)' }}>
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span className="truncate text-[11.5px]" style={{ color: 'var(--text-subtle)' }}>
                          {item.subtitle}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
