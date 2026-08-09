import type { ReactNode } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { Toggle } from '@/shared/design-system/Toggle';
import { useThemeStore } from '@/app/theme-store';

/**
 * Data-source management isn't built yet (needs the connector abstraction
 * from Phase 3 of the roadmap), but Appearance is real -- it's just the
 * theme store, already wired end-to-end.
 */
export function ConnectionsScreen() {
  const { themeOverride, isFlat, setDark, setFlat } = useThemeStore();
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = themeOverride ? themeOverride === 'dark' : prefersDark;

  return (
    <div>
      <div className="os-font-mono mb-2.5 ml-0.5 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-muted)' }}>
        Appearance
      </div>
      <Panel className="max-w-[460px] px-[18px] py-1">
        <SettingRow
          title="Dark mode"
          description="Follows system unless overridden"
          control={<Toggle checked={isDark} onChange={setDark} label="Toggle dark mode" />}
        />
        <SettingRow
          borderTop
          title="Flat mode"
          description="Turns off neomorphic depth — flat, bordered surfaces instead"
          control={<Toggle checked={isFlat} onChange={setFlat} label="Toggle flat mode" />}
        />
      </Panel>
    </div>
  );
}

function SettingRow({
  title,
  description,
  control,
  borderTop = false,
}: {
  title: string;
  description: string;
  control: ReactNode;
  borderTop?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-3.5"
      style={borderTop ? { borderTop: '1px solid var(--hairline)' } : undefined}
    >
      <div>
        <div className="text-[13px] font-semibold">{title}</div>
        <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
          {description}
        </div>
      </div>
      {control}
    </div>
  );
}
