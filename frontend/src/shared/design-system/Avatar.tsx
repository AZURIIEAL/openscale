interface AvatarProps {
  name: string;
  size?: number;
}

/** Initials avatar -- no photo upload in this tool, so it's always the
 * two-letter monogram derived from `name`. */
export function Avatar({ name, size = 32 }: AvatarProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flex: '0 0 auto',
        borderRadius: 999,
        background: 'var(--brand)',
        color: '#FFFFFF',
        fontFamily: 'var(--font-core)',
        fontSize: size * 0.36,
        fontWeight: 700,
        letterSpacing: '0.01em',
      }}
    >
      {initials}
    </span>
  );
}
