/** Small rotating ring -- used wherever a control needs to show "in
 * progress" inline (e.g. a catalog row while its job is running). */
export function Spinner({ label = 'Running' }: { label?: string }) {
  return <span className="os-spinner" role="img" aria-label={label} />;
}
