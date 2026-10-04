'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { Icon } from '../ui/Icon';
import { NAV_SECTIONS, matchNav } from './nav';

/**
 * Navy navigation rail. `compact` renders icon-only on tablet widths while
 * desktop always shows labels.
 */
export function Sidebar({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { canAny } = useAuth();
  const active = matchNav(pathname)?.href;
  const hideLabel = compact ? 'md:sr-only lg:not-sr-only' : '';

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAny(item.any)),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--navy)] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full border border-white/5"
      />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[var(--orange)]/5" />

      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={`relative flex items-center gap-3 px-6 py-6 ${compact ? 'md:justify-center md:px-0 lg:justify-start lg:px-6' : ''}`}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--orange)] text-[var(--navy-dark)]">
          <Icon name="leaf" />
        </span>
        <span className={hideLabel}>
          <span className="block text-[0.65rem] font-semibold tracking-[0.3em] text-[var(--orange)]">FERNLEAF</span>
          <span className="serif block text-2xl leading-none">Kitchen</span>
        </span>
      </Link>

      <nav aria-label="Main" className="relative flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {sections.map((section) => (
          <div key={section.title}>
            <p className={`mb-2 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/40 ${hideLabel}`}>
              {section.title}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = item.href === active;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                      title={item.label}
                      className={`group flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium transition-[background-color,color] duration-150 ${
                        compact ? 'md:justify-center lg:justify-start' : ''
                      } ${
                        isActive
                          ? 'bg-[var(--orange)] text-[var(--navy-dark)] shadow-[0_6px_16px_rgba(244,163,64,0.25)]'
                          : 'text-white/75 hover:bg-white/8 hover:text-white'
                      }`}
                    >
                      <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                      <span className={hideLabel}>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <p className={`relative border-t border-white/10 px-6 py-4 text-xs text-white/40 ${hideLabel}`}>
        Asia/Kolkata · Kitchen time
      </p>
    </div>
  );
}
