'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard/admin', label: 'Admin', permission: 'reports.view' },
  { href: '/dashboard/kitchen', label: 'Kitchen', permission: 'kitchen.view' },
  { href: '/dashboard/dispatch', label: 'Dispatch', permission: 'dispatch.view' },
  { href: '/dashboard/driver', label: 'Driver', permission: 'driver.view' },
  { href: '/companies', label: 'Companies', permission: 'companies.view' },
  { href: '/employees', label: 'Employees', permission: 'employees.view' },
  { href: '/pricing', label: 'Pricing', permission: 'pricing.view' },
];

export function DashboardShell({
  permissions,
  children,
}: {
  permissions: string[];
  children: React.ReactNode;
}) {
  const path = usePathname();
  const allowed = LINKS.filter((link) => permissions.includes(link.permission));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
      <nav className="flex flex-wrap gap-3 text-sm">
        {allowed.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={path === link.href ? 'font-semibold underline' : 'underline'}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}

export function Kpi({ label, value }: { label: string; value: string | number | null }) {
  return (
    <article className="rounded border p-3">
      <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-semibold">{value ?? '—'}</p>
    </article>
  );
}
