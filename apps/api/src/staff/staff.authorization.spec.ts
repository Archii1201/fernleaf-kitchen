import 'reflect-metadata';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from '../auth/permissions.js';
import { StaffController } from './staff.controller.js';

const STAFF_PERMISSIONS: string[] = [
  PERMISSIONS.STAFF_VIEW,
  PERMISSIONS.STAFF_MANAGE,
];

const handlers = [
  'list',
  'create',
  'getById',
  'update',
  'updateRole',
  'updateActive',
] as const;

function requiredPermissions(handler: (typeof handlers)[number]): string[] {
  const prototype = StaffController.prototype as unknown as Record<
    string,
    () => unknown
  >;

  return (Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, prototype[handler]) ??
    []) as string[];
}

describe('staff endpoint authorization', () => {
  it('protects every staff route with a staff permission', () => {
    for (const handler of handlers) {
      const required = requiredPermissions(handler);

      expect(required.length).toBeGreaterThan(0);
      for (const permission of required) {
        expect(STAFF_PERMISSIONS).toContain(permission);
      }
    }
  });

  it('requires the manage permission for every write route', () => {
    for (const handler of ['create', 'update', 'updateRole', 'updateActive'] as const) {
      expect(requiredPermissions(handler)).toEqual([PERMISSIONS.STAFF_MANAGE]);
    }
  });

  it('gives staff permissions to Admin only', () => {
    expect(ROLE_PERMISSIONS[ROLES.ADMIN]).toContain(PERMISSIONS.STAFF_VIEW);
    expect(ROLE_PERMISSIONS[ROLES.ADMIN]).toContain(PERMISSIONS.STAFF_MANAGE);

    for (const roleName of [ROLES.KITCHEN, ROLES.DISPATCH, ROLES.DRIVER]) {
      expect(ROLE_PERMISSIONS[roleName]).not.toContain(PERMISSIONS.STAFF_VIEW);
      expect(ROLE_PERMISSIONS[roleName]).not.toContain(PERMISSIONS.STAFF_MANAGE);
    }
  });
});
