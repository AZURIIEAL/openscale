import type { ReactNode } from 'react';
import { Panel } from '@/shared/design-system/Panel';
import { Toggle } from '@/shared/design-system/Toggle';
import { useThemeStore, type VisualMode } from '@/app/theme-store';
import { resolveAccentPreset } from '@/app/accent-presets';
import { ThemeColorPicker } from './ThemeColorPicker';
import { ShadowDepthSlider } from './ShadowDepthSlider';
import { FontSizeStepper } from './FontSizeStepper';
import { VisualModeSelector } from './VisualModeSelector';

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
    shadowScale,
    uiScale,
    setDark,
    setVisualMode,
    setAccent,
    setShadowScale,
    setUiScale,
  } = useThemeStore();
  const isDark = themeOverride === 'dark';
  const selectedAccentName = resolveAccentPreset(accentId).name;
  const depthControl = DEPTH_CONTROL[visualMode];

  return (
    <div>
      <div className="os-font-mono mb-2.5 ml-0.5 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-muted)' }}>
        Interface style
      </div>
      <Panel className="max-w-[560px] px-[18px] py-4">
        <VisualModeSelector value={visualMode} onChange={setVisualMode} />
      </Panel>

      <div className="os-font-mono mb-2.5 ml-0.5 mt-6 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-muted)' }}>
        Appearance
      </div>
      <Panel className="max-w-[460px] px-[18px] py-1">
        <SettingRow
          title="Dark mode"
          description="Follows system unless overridden"
          control={<Toggle checked={isDark} onChange={setDark} label="Toggle dark mode" />}
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
      </Panel>

      <div className="os-font-mono mb-2.5 ml-0.5 mt-6 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--ink-muted)' }}>
        Theme color
      </div>
      <Panel className="max-w-[460px] px-[18px] py-4">
        <div className="mb-3 text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
          Currently <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{selectedAccentName}</b> — applies everywhere the accent color is used (active nav, buttons, focus rings).
        </div>
        <ThemeColorPicker accentId={accentId} isDark={isDark} onSelect={setAccent} />
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
