import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from '../auth/permissions.js';
import { EmployeesController } from '../employees/employees.controller.js';
import { CompaniesController } from './companies.controller.js';

const READ_ONLY_HANDLERS = new Set([
  'list',
  'listEligibleDrivers',
  'getById',
  'listDomains',
  'listAddresses',
  'getCalendar',
  'getMenuVisibility',
]);

function permissionsFor(controller: object, handler: string): string[] {
  const prototype = controller as { prototype: Record<string, unknown> };

  return (
    (Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      prototype.prototype[handler] as object,
    ) as string[] | undefined) ?? []
  );
}

function handlersOf(controller: object): string[] {
  const prototype = (controller as { prototype: object }).prototype;

  return Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== 'constructor',
  );
}

describe('companies and employees authorization', () => {
  it('guards every company route with a companies permission', () => {
    for (const handler of handlersOf(CompaniesController)) {
      const required = permissionsFor(CompaniesController, handler);
      const expected = READ_ONLY_HANDLERS.has(handler)
        ? PERMISSIONS.COMPANIES_VIEW
        : PERMISSIONS.COMPANIES_MANAGE;

      expect(required, `CompaniesController.${handler}`).toEqual([expected]);
    }
  });

  it('guards every employee route with an employees permission', () => {
    for (const handler of handlersOf(EmployeesController)) {
      const required = permissionsFor(EmployeesController, handler);
      const expected = READ_ONLY_HANDLERS.has(handler)
        ? PERMISSIONS.EMPLOYEES_VIEW
        : PERMISSIONS.EMPLOYEES_MANAGE;

      expect(required, `EmployeesController.${handler}`).toEqual([expected]);
    }
  });

  it('reserves company and employee administration for Admin', () => {
    const adminOnly = [
      PERMISSIONS.COMPANIES_VIEW,
      PERMISSIONS.COMPANIES_MANAGE,
      PERMISSIONS.EMPLOYEES_VIEW,
      PERMISSIONS.EMPLOYEES_MANAGE,
    ];

    for (const permission of adminOnly) {
      expect(ROLE_PERMISSIONS[ROLES.ADMIN]).toContain(permission);
    }

    for (const roleName of [ROLES.KITCHEN, ROLES.DISPATCH, ROLES.DRIVER]) {
      for (const permission of adminOnly) {
        expect(ROLE_PERMISSIONS[roleName]).not.toContain(permission);
      }
    }
  });
});
