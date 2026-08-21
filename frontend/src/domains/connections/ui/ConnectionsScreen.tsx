import type { ReactNode } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Panel } from '@/shared/design-system/Panel';
import { SegmentedToggle } from '@/shared/design-system/SegmentedToggle';
import { useThemeStore, type VisualMode } from '@/app/theme-store';
import { resolveAccentPreset } from '@/app/accent-presets';
import { ThemeColorPicker } from './ThemeColorPicker';
import { ShadowDepthSlider } from './ShadowDepthSlider';
import { FontSizeStepper } from './FontSizeStepper';
import { VisualModeSelector } from './VisualModeSelector';
import { ChartStylePicker } from './ChartStylePicker';

/** Which modes have a scalable depth/glow/blur effect, and what the
 * "Shadow depth" slider (--shadow-scale) should be called for that mode.
 * Flat, Outlined, and High contrast have no shadow of any kind by design,
 * so they're absent here and the row is hidden entirely rather than shown
 * disabled or captioned "no effect". */
const DEPTH_CONTROL: Partial<Record<VisualMode, { title: string; description: string }>> = {
  neumorphic: { title: 'Shadow depth', description: 'How pronounced the neumorphic shadows are' },
  elevated: { title: 'Shadow depth', description: 'How pronounced the elevation shadow is' },
  glass: { title: 'Blur intensity', description: 'How strong the background blur is' },
  brutalist: { title: 'Shadow offset', description: 'How far the hard shadow is offset' },
  clay: { title: 'Puffiness', description: 'How pronounced the clay shadow is' },
  terminal: { title: 'Glow intensity', description: 'How strong the border glow is' },
  aurora: { title: 'Glow intensity', description: 'How strong the ambient glow is' },
  paper: { title: 'Shadow depth', description: 'How pronounced the paper shadow is' },
  skeuomorphic: { title: 'Bevel depth', description: 'How pronounced the bevel shadow is' },
};

const THEME_ITEMS = [
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
];

/**
 * Data-source management isn't built yet (needs the connector abstraction
 * from Phase 3 of the roadmap), but Appearance is real -- it's just the
 * theme store, already wired end-to-end.
 */
export function ConnectionsScreen() {
  const {
    themeOverride,
    visualMode,
    accentId,
    chartStyle,
    shadowScale,
    uiScale,
    setDark,
    setVisualMode,
    setAccent,
    setChartStyle,
    setShadowScale,
    setUiScale,
  } = useThemeStore();
  const selectedAccentName = resolveAccentPreset(accentId).name;
  const depthControl = DEPTH_CONTROL[visualMode];

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-5">
        <Panel>
          <SectionHeader title="Interface style" subtitle="Applies to cards, borders and elevation" />
          <div className="mt-4">
            <VisualModeSelector value={visualMode} onChange={setVisualMode} />
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Chart style" subtitle="Applies to every bar chart on Home and Dashboards" />
          <div className="mt-4">
            <ChartStylePicker value={chartStyle} onChange={setChartStyle} />
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-5">
        <Panel>
          <SectionHeader title="Appearance" />
          <div className="mt-3 flex flex-col gap-1">
            <SettingRow
              title="Theme"
              description="Follows system unless overridden"
              control={<SegmentedToggle items={THEME_ITEMS} value={themeOverride} onChange={(v) => setDark(v === 'dark')} />}
            />
            {depthControl && (
              <SettingRow
                borderTop
                title={depthControl.title}
                description={depthControl.description}
                control={<ShadowDepthSlider value={shadowScale} onChange={setShadowScale} />}
              />
            )}
            <SettingRow
              borderTop
              title="Font size"
              description="Scales all text and UI elements"
              control={<FontSizeStepper value={uiScale} onChange={setUiScale} />}
            />
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Accent" subtitle="Ember is the system accent; pick its depth" />
          <div className="mt-4">
            <ThemeColorPicker accentId={accentId} onSelect={setAccent} />
          </div>
          <p className="text-wrap-pretty" style={{ margin: '16px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Currently <b style={{ color: 'var(--text-heading)', fontWeight: 700 }}>{selectedAccentName}</b> — used on active nav,
            primary meters and chart series.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-heading)' }}>{title}</h3>
      {subtitle && <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>{subtitle}</p>}
    </header>
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
      className="flex items-center justify-between gap-4 py-3.5"
      style={borderTop ? { borderTop: '1px solid var(--border-subtle)' } : undefined}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-body)' }}>{title}</div>
        <div style={{ marginTop: 2, fontSize: 13, color: 'var(--text-muted)' }}>{description}</div>
      </div>
      {control}
    </div>
  );
}
