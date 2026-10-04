'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { formatDate, todayIso } from '../../lib/format';
import { Icon } from '../ui/Icon';
import { titleFor } from './nav';

export function Header({
  onOpenMobile,
  onToggleRail,
  railExpanded,
}: {
  onOpenMobile: () => void;
  onToggleRail: () => void;
  railExpanded: boolean;
}) {
  const pathname = usePathname();
  const { profile, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initials = (profile?.email ?? '?').slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--cream)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 md:px-8">
        <button
          type="button"
          onClick={onOpenMobile}
          className="rounded-[var(--radius-sm)] p-2 text-[var(--navy)] hover:bg-[var(--cream-soft)] md:hidden"
          aria-label="Open navigation"
        >
          <Icon name="menu" />
        </button>
        <button
          type="button"
          onClick={onToggleRail}
          className="hidden rounded-[var(--radius-sm)] p-2 text-[var(--navy)] hover:bg-[var(--cream-soft)] md:inline-flex lg:hidden"
          aria-label={railExpanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={railExpanded}
        >
          <Icon name={railExpanded ? 'chevronLeft' : 'chevronRight'} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--navy)]">{titleFor(pathname)}</p>
          <p className="hidden text-xs text-[var(--muted)] sm:block">{formatDate(todayIso())} · Kitchen time</p>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-3 rounded-full py-1 pl-1 pr-3 transition-colors duration-150 hover:bg-[var(--cream-soft)]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--navy)] text-xs font-bold text-white">
              {initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-[180px] truncate text-sm font-semibold text-[var(--navy)]">{profile?.email}</span>
              <span className="block text-xs text-[var(--muted)]">{profile?.roleName}</span>
            </span>
            <Icon name="chevronDown" className="h-4 w-4 text-[var(--muted)]" />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="scale-in absolute right-0 mt-2 w-64 origin-top-right overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow-hover)]"
            >
              <div className="border-b border-[var(--border)] bg-[var(--ivory)] px-4 py-3">
                <p className="truncate text-sm font-semibold text-[var(--navy)]">{profile?.email}</p>
                <p className="text-xs text-[var(--muted)]">
                  {profile?.roleName} · {profile?.permissions.length ?? 0} permissions
                </p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => void logout()}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--danger)] transition-colors duration-150 hover:bg-[var(--danger-soft)]"
              >
                <Icon name="logout" className="h-4 w-4" />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
