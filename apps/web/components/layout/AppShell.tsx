'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { matchNav } from './nav';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, loading, canAny } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const closeRail = useCallback(() => setRailExpanded(false), []);

  useEffect(() => {
    if (!loading && !profile) {
      router.replace('/login');
    }
  }, [loading, profile, router]);

  const section = matchNav(pathname);
  const allowed = !section || canAny(section.any);

  return (
    <div className="paper min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-white px-4 py-2 text-[var(--navy)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <aside
        className={`sidebar-transition fixed inset-y-0 left-0 z-30 hidden md:block ${
          railExpanded ? 'w-64 shadow-[var(--shadow-modal)] lg:shadow-none' : 'w-20 lg:w-64'
        }`}
      >
        <Sidebar compact={!railExpanded} onNavigate={closeRail} />
      </aside>
      {railExpanded ? (
        <button
          type="button"
          aria-label="Collapse navigation"
          className="fade-in fixed inset-0 z-20 hidden bg-[rgba(16,36,63,0.25)] md:block lg:hidden"
          onClick={closeRail}
        />
      ) : null}

      <MobileNav open={mobileOpen} onClose={closeMobile} />

      <div className="md:pl-20 lg:pl-64">
        <Header
          onOpenMobile={() => setMobileOpen(true)}
          onToggleRail={() => setRailExpanded((value) => !value)}
          railExpanded={railExpanded}
        />
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-10">
          {loading || !profile ? (
            <div className="space-y-4" role="status" aria-label="Loading session">
              <Skeleton className="h-12 w-72" />
              <Skeleton className="h-40" />
            </div>
          ) : allowed ? (
            <div key={pathname} className="fade-in">
              {children}
            </div>
          ) : (
            <EmptyState
              icon="alert"
              title="You do not have access to this area"
              hint="Your role does not include the permission this page needs. Ask an administrator if you need it."
            />
          )}
        </main>
      </div>
    </div>
  );
}
