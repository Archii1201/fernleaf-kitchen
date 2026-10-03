import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
} from './permissions.js';

describe('permission catalogue', () => {
  it('has unique permission keys', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('grants every permission to Admin', () => {
    expect([...ROLE_PERMISSIONS[ROLES.ADMIN]].sort()).toEqual(
      [...ALL_PERMISSIONS].sort(),
    );
  });

  it('only grants permissions that exist in the catalogue', () => {
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(ALL_PERMISSIONS).toContain(permission);
      }
    }
  });

  it('keeps the four roles isolated to their own area', () => {
    expect(ROLE_PERMISSIONS[ROLES.KITCHEN]).toContain(PERMISSIONS.KITCHEN_UPDATE);
    expect(ROLE_PERMISSIONS[ROLES.KITCHEN]).not.toContain(
      PERMISSIONS.DISPATCH_MANAGE,
    );
    expect(ROLE_PERMISSIONS[ROLES.KITCHEN]).not.toContain(
      PERMISSIONS.DELIVERY_UPDATE,
    );

    expect(ROLE_PERMISSIONS[ROLES.DISPATCH]).toContain(
      PERMISSIONS.DISPATCH_MANAGE,
    );
    expect(ROLE_PERMISSIONS[ROLES.DISPATCH]).not.toContain(
      PERMISSIONS.KITCHEN_UPDATE,
    );

    expect(ROLE_PERMISSIONS[ROLES.DRIVER]).toContain(PERMISSIONS.DELIVERY_UPDATE);
    expect(ROLE_PERMISSIONS[ROLES.DRIVER]).not.toContain(
      PERMISSIONS.KITCHEN_UPDATE,
    );
    expect(ROLE_PERMISSIONS[ROLES.DRIVER]).not.toContain(
      PERMISSIONS.DISPATCH_MANAGE,
    );
  });

  it('reserves kitchen force-complete for Admin', () => {
    expect(ROLE_PERMISSIONS[ROLES.KITCHEN]).not.toContain(
      PERMISSIONS.KITCHEN_FORCE_COMPLETE,
    );
  });

  it('lets Kitchen read the resolved menu but never manage it', () => {
    expect(ROLE_PERMISSIONS[ROLES.KITCHEN]).toContain(PERMISSIONS.MENU_VIEW);

    for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      if (roleName === ROLES.ADMIN) {
        continue;
      }

      expect(permissions).not.toContain(PERMISSIONS.MENU_MANAGE);
    }
  });

  it('lets Kitchen read pricing but never change it', () => {
    expect(ROLE_PERMISSIONS[ROLES.KITCHEN]).toContain(PERMISSIONS.PRICING_VIEW);

    for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      if (roleName === ROLES.ADMIN) {
        continue;
      }

      expect(permissions).not.toContain(PERMISSIONS.PRICING_MANAGE);
    }
  });

  it('gives every role the ability to read its own profile', () => {
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      expect(permissions).toContain(PERMISSIONS.PROFILE_READ);
    }
  });

  it('reserves user administration for Admin', () => {
    for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      if (roleName === ROLES.ADMIN) {
        continue;
      }

      expect(permissions).not.toContain(PERMISSIONS.USERS_MANAGE);
    }
  });
});
