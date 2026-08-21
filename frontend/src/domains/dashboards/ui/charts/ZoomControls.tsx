interface ZoomControlsProps {
  zoomLabel: string;
  onReset: () => void;
}

/** Shown above a TrendChart/BarChart only while zoomed -- the magnification
 * factor + point count, and a reset back to the full series. */
export function ZoomControls({ zoomLabel, onReset }: ZoomControlsProps) {
  return (
    <div className="os-font-mono mb-1.5 flex items-center justify-between text-[10px]" style={{ color: 'var(--brand)' }}>
      <span>{zoomLabel}</span>
      <button
        type="button"
        onClick={onReset}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', fontWeight: 600 }}
      >
        ⟲ Reset zoom
      </button>
    </div>
  );
}
