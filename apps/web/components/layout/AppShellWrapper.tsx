'use client';

import { usePathname } from 'next/navigation';
import { AppShell } from './AppShell';

export function AppShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // /login has its own full-page split layout and does not use AppShell
  if (pathname === '/login') {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
