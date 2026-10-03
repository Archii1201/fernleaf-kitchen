/**
 * The permission catalogue. Code only ever refers to these keys, never to role
 * names, so authorization stays data-driven: re-assigning a permission is a
 * database change, not a code change.
 */
export const PERMISSIONS = {
  PROFILE_READ: 'profile.read',

  ORDERS_VIEW: 'orders.view',
  ORDERS_EDIT: 'orders.edit',
  ORDERS_CONFIRM: 'orders.confirm',

  CATALOGUE_VIEW: 'catalogue.view',
  CATALOGUE_MANAGE: 'catalogue.manage',
  PRICING_VIEW: 'pricing.view',
  PRICING_MANAGE: 'pricing.manage',
  MENU_MANAGE: 'menu.manage',

  COMPANIES_VIEW: 'companies.view',
  COMPANIES_MANAGE: 'companies.manage',

  EMPLOYEES_VIEW: 'employees.view',
  EMPLOYEES_MANAGE: 'employees.manage',

  KITCHEN_VIEW: 'kitchen.view',
  KITCHEN_UPDATE: 'kitchen.update',

  DISPATCH_VIEW: 'dispatch.view',
  DISPATCH_MANAGE: 'dispatch.manage',

  DELIVERY_VIEW: 'delivery.view',
  DELIVERY_UPDATE: 'delivery.update',

  BILLING_VIEW: 'billing.view',
  BILLING_MANAGE: 'billing.manage',

  SETTINGS_READ: 'settings.read',
  SETTINGS_MANAGE: 'settings.manage',

  STAFF_VIEW: 'staff.view',
  STAFF_MANAGE: 'staff.manage',

  USERS_MANAGE: 'users.manage',
  REPORTS_VIEW: 'reports.view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly PermissionKey[] =
  Object.values(PERMISSIONS);

export const ROLES = {
  ADMIN: 'Admin',
  KITCHEN: 'Kitchen',
  DISPATCH: 'Dispatch',
  DRIVER: 'Driver',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/**
 * Which permissions each seeded role holds. Admin holds everything; the other
 * three are scoped to the part of the operation they work in.
 */
export const ROLE_PERMISSIONS: Record<RoleName, readonly PermissionKey[]> = {
  [ROLES.ADMIN]: ALL_PERMISSIONS,
  [ROLES.KITCHEN]: [
    PERMISSIONS.PROFILE_READ,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.KITCHEN_VIEW,
    PERMISSIONS.KITCHEN_UPDATE,
    // Kitchen staff read the catalogue and the price grid they cook against,
    // but pricing decisions stay with Admin (`pricing.manage`).
    PERMISSIONS.CATALOGUE_VIEW,
    PERMISSIONS.PRICING_VIEW,
  ],
  [ROLES.DISPATCH]: [
    PERMISSIONS.PROFILE_READ,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.DISPATCH_VIEW,
    PERMISSIONS.DISPATCH_MANAGE,
    PERMISSIONS.DELIVERY_VIEW,
  ],
  [ROLES.DRIVER]: [
    PERMISSIONS.PROFILE_READ,
    PERMISSIONS.DELIVERY_VIEW,
    PERMISSIONS.DELIVERY_UPDATE,
  ],
};
