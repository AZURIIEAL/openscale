import type { LucideIcon } from 'lucide-react';

interface SegmentedItem<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedToggleProps<T extends string> {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Pill-shaped multi-way switch (Connections screen's Light/Dark theme
 * control). Unlike the binary `Toggle`, this takes an arbitrary list of
 * options rendered as adjacent segments. */
export function SegmentedToggle<T extends string>({ items, value, onChange }: SegmentedToggleProps<T>) {
  return (
    <div
      className="os-panel inline-flex"
      style={{ gap: 4, padding: 4, borderRadius: 999 }}
    >
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            aria-label={item.label}
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className="inline-flex items-center justify-center gap-2 transition-colors"
            style={{
              height: 32,
              padding: '0 14px',
              borderRadius: 999,
              cursor: 'pointer',
              background: active ? 'var(--surface-inverse)' : 'transparent',
              color: active ? 'var(--text-on-inverse)' : 'var(--text-subtle)',
              fontFamily: 'var(--font-core)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {Icon && <Icon size={15} strokeWidth={1.75} />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
