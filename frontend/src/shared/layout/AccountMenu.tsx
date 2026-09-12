import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Avatar } from '@/shared/design-system/Avatar';
import { Toggle } from '@/shared/design-system/Toggle';
import { InfrastructureIcon } from '@/shared/design-system';
import { useThemeStore } from '@/app/theme-store';

const ACCOUNT_NAME = 'Abin Binu';
const ACCOUNT_ROLE = 'Platform owner';

/**
 * The account chip's dropdown. This app has no real auth/user system
 * (deliberately -- see ideas/vision-and-roadmap.md's Phase 9, "multi-user
 * & auth ... deliberately late"), so there's no profile/session/sign-out
 * to wire up here -- ACCOUNT_NAME/ROLE are the same fixed local-console
 * identity the chip already showed, not a fabricated login state. Every
 * item below links to or controls something real: Settings and
 * Infrastructure are actual screens, and the dark-mode toggle reads/writes
 * the same useThemeStore state (persisted server-side via
 * useAppearanceSync) as the equivalent control on the Settings screen --
 * nothing invented for this menu specifically.
 */
export function AccountMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const themeOverride = useThemeStore((s) => s.themeOverride);
  const setDark = useThemeStore((s) => s.setDark);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative hidden sm:flex">
      <button
        type="button"
        aria-label={`Account: ${ACCOUNT_NAME}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 36,
          boxSizing: 'border-box',
          padding: '0 10px 0 3px',
          border: `1px solid ${open ? 'var(--brand)' : 'var(--border-subtle)'}`,
          borderRadius: 999,
          background: 'var(--surface-card)',
          boxShadow: open ? '0 0 0 3px var(--ring-tint)' : 'var(--shadow-card)',
          cursor: 'pointer',
          fontFamily: 'var(--font-core)',
          textAlign: 'left',
        }}
      >
        <Avatar name={ACCOUNT_NAME} size={30} />
        <span className="hidden md:flex" style={{ flexDirection: 'column', gap: 1, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-heading)', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
            {ACCOUNT_NAME}
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--text-subtle)', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{ACCOUNT_ROLE}</span>
        </span>
        <ChevronDown
          size={14}
          color="var(--text-subtle)"
          className="hidden md:block"
          style={{ transition: 'transform var(--dur-fast) var(--ease-standard)', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div
          className="os-panel"
          style={{
            position: 'absolute',
            top: 44,
            right: 0,
            width: 240,
            padding: 8,
            zIndex: 40,
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          <div className="flex items-center gap-3 px-2 pb-2 pt-1">
            <Avatar name={ACCOUNT_NAME} size={34} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>
                {ACCOUNT_NAME}
              </div>
              <div className="truncate text-[11.5px]" style={{ color: 'var(--text-subtle)' }}>
                {ACCOUNT_ROLE}
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/connections');
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-body)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-sunken)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <SlidersHorizontal size={15} color="var(--text-subtle)" />
            Appearance &amp; interface settings
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/infrastructure');
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-body)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-sunken)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <InfrastructureIcon size={15} color="var(--text-subtle)" />
            System health &amp; infrastructure
          </button>

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-[13px] font-medium" style={{ color: 'var(--text-body)' }}>
              Dark mode
            </span>
            <Toggle checked={themeOverride === 'dark'} onChange={setDark} label="Dark mode" />
          </div>
        </div>
      )}
    </div>
  );
}
