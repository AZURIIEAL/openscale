import { useEffect, useState } from 'react';

/**
 * Shared drag-to-zoom mechanics for TrendChart/BarChart: drag a selection
 * across the chart to zoom into that range (rescaling both axes to the
 * subset), with a reset back to the full series. Index-space only -- each
 * chart owns its own pixel<->index conversion (SVG viewBox math for
 * TrendChart, flexbox percentages for BarChart) and calls startDrag/
 * updateDrag with whatever "local index into the currently displayed
 * points" it computes.
 */
export function useChartZoom<T>(points: T[], labelOf: (point: T) => string) {
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [dragStartLocal, setDragStartLocal] = useState<number | null>(null);
  const [dragEndLocal, setDragEndLocal] = useState<number | null>(null);

  // Defensive against the underlying series changing size (e.g. a refetch)
  // out from under an active zoom.
  const clamped: [number, number] | null = zoomRange
    ? [Math.max(0, Math.min(zoomRange[0], points.length - 2)), Math.min(zoomRange[1], points.length - 1)]
    : null;

  const displayPoints = clamped ? points.slice(clamped[0], clamped[1] + 1) : points;
  const baseOffset = clamped ? clamped[0] : 0;

  function startDrag(localIndex: number) {
    setDragStartLocal(localIndex);
    setDragEndLocal(localIndex);
  }

  function updateDrag(localIndex: number) {
    setDragEndLocal(localIndex);
  }

  // Finalized on window 'mouseup' (not the chart's own onMouseUp) so a drag
  // that ends outside the chart's bounds still completes correctly.
  useEffect(() => {
    if (dragStartLocal === null) return;
    function finish() {
      if (dragStartLocal !== null && dragEndLocal !== null && Math.abs(dragEndLocal - dragStartLocal) >= 1) {
        const lo = Math.min(dragStartLocal, dragEndLocal);
        const hi = Math.max(dragStartLocal, dragEndLocal);
        setZoomRange([baseOffset + lo, baseOffset + hi]);
      }
      setDragStartLocal(null);
      setDragEndLocal(null);
    }
    window.addEventListener('mouseup', finish);
    return () => window.removeEventListener('mouseup', finish);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragStartLocal, dragEndLocal]);

  const dragLocalRange: [number, number] | null =
    dragStartLocal !== null && dragEndLocal !== null
      ? [Math.min(dragStartLocal, dragEndLocal), Math.max(dragStartLocal, dragEndLocal)]
      : null;

  const isZoomed = clamped !== null;
  const magnification = isZoomed ? points.length / displayPoints.length : 1;
  const zoomLabel = isZoomed
    ? `${labelOf(points[clamped[0]])} – ${labelOf(points[clamped[1]])} · ${magnification.toFixed(1)}x (${displayPoints.length}/${points.length})`
    : null;

  return {
    displayPoints,
    isZoomed,
    zoomLabel,
    isDragging: dragStartLocal !== null,
    dragLocalRange,
    startDrag,
    updateDrag,
    reset: () => setZoomRange(null),
  };
}
