import type { IconName } from '../ui/Icon';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Visible when the user holds any of these permissions. */
  any: readonly string[];
}

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: 'dashboard',
        any: ['reports.view', 'kitchen.view', 'dispatch.view', 'driver.view'],
      },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/orders', label: 'Orders', icon: 'orders', any: ['orders.view'] },
      { href: '/kitchen', label: 'Kitchen', icon: 'kitchen', any: ['kitchen.view'] },
      { href: '/dispatch', label: 'Dispatch', icon: 'dispatch', any: ['dispatch.view'] },
      { href: '/driver', label: 'My deliveries', icon: 'driver', any: ['driver.view'] },
    ],
  },
  {
    title: 'Food',
    items: [
      { href: '/catalogue', label: 'Catalogue', icon: 'catalogue', any: ['catalogue.view'] },
      { href: '/menu', label: 'Menu', icon: 'menu', any: ['menu.view'] },
      { href: '/pricing', label: 'Pricing', icon: 'pricing', any: ['pricing.view'] },
    ],
  },
  {
    title: 'Customers',
    items: [
      { href: '/companies', label: 'Companies', icon: 'companies', any: ['companies.view'] },
      { href: '/employees', label: 'Employees', icon: 'employees', any: ['employees.view'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/billing', label: 'Billing', icon: 'billing', any: ['billing.view'] },
      { href: '/staff', label: 'Staff', icon: 'staff', any: ['staff.view'] },
      { href: '/settings', label: 'Settings', icon: 'settings', any: ['settings.read'] },
    ],
  },
];

const ALL = NAV_SECTIONS.flatMap((section) => section.items);

export function matchNav(pathname: string): NavItem | undefined {
  return ALL.filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}

const TITLES: Record<string, string> = {
  '/catalogue/dishes': 'Dishes',
  '/catalogue/options': 'Options',
  '/catalogue/groups': 'Option groups',
  '/orders/new': 'New order',
};

export function titleFor(pathname: string): string {
  return TITLES[pathname] ?? matchNav(pathname)?.label ?? 'Fernleaf Kitchen';
}
