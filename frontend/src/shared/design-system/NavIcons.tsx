import type { ComponentPropsWithoutRef } from 'react';

type IconProps = ComponentPropsWithoutRef<'svg'>;

function baseProps({ className = '', ...rest }: IconProps) {
  return {
    viewBox: '0 0 24 24',
    width: 16,
    height: 16,
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
    ...rest,
  };
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  );
}

export function PipelinesIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="5" cy="6" r="2.25" />
      <circle cx="5" cy="18" r="2.25" />
      <circle cx="17" cy="12" r="2.25" />
      <path d="M7.25 6H12a3 3 0 0 1 3 3v0" />
      <path d="M7.25 18H12a3 3 0 0 0 3-3v0" />
      <path d="M19.25 12H21" />
    </svg>
  );
}

export function SqlEditorIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 4h16v16H4z" />
      <path d="M9 9l-2.5 3L9 15" />
      <path d="M14 9h3.5v3H15v3h2.5" />
    </svg>
  );
}

export function DataCatalogIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <ellipse cx="12" cy="6" rx="7.5" ry="2.75" />
      <path d="M4.5 6v6c0 1.52 3.358 2.75 7.5 2.75s7.5-1.23 7.5-2.75V6" />
      <path d="M4.5 12v6c0 1.52 3.358 2.75 7.5 2.75s7.5-1.23 7.5-2.75v-6" />
    </svg>
  );
}

export function NotebooksIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M5 3.5h12a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H5z" />
      <path d="M5 3.5a1.5 1.5 0 0 0 0 3M5 8h.01M5 12h.01M5 16h.01" />
      <path d="M9.5 8h6M9.5 12h6M9.5 16h4" />
    </svg>
  );
}

export function MlWorkbenchIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M12 2.5V7M12 17v4.5M2.5 12H7M17 12h4.5M4.8 4.8 7.6 7.6M16.4 16.4l2.8 2.8M19.2 4.8 16.4 7.6M7.6 16.4l-2.8 2.8" />
    </svg>
  );
}

export function StreamingIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3 13.5h3.5L9 8l3.5 10L15 6l2.5 7.5H21" />
    </svg>
  );
}

export function DashboardsIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.25" />
      <rect x="13" y="3.5" width="7.5" height="4.75" rx="1.25" />
      <rect x="13" y="10.75" width="7.5" height="9.75" rx="1.25" />
      <rect x="3.5" y="13.5" width="7.5" height="7" rx="1.25" />
    </svg>
  );
}

export function InfrastructureIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3.5" y="4" width="17" height="5.5" rx="1.25" />
      <rect x="3.5" y="14.5" width="17" height="5.5" rx="1.25" />
      <path d="M7 6.75h.01M7 17.25h.01" />
    </svg>
  );
}

export function ConnectionsIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 5.5 13.5 3a3.2 3.2 0 0 1 4.5 4.5L15.5 10" />
      <path d="M13 18.5 10.5 21a3.2 3.2 0 0 1-4.5-4.5L8.5 14" />
    </svg>
  );
}
