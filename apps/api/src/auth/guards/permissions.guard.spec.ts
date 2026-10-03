import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import {
  InsufficientPermissionsError,
  MissingAuthenticationError,
} from '../auth.errors.js';
import type { PermissionService } from '../permission.service.js';
import type { AuthenticatedUser } from '../types/authenticated-user.js';
import { PermissionsGuard } from './permissions.guard.js';

const kitchenUser: AuthenticatedUser = {
  id: 'user-1',
  email: 'kitchen@test.com',
  roleId: 'role-2',
  roleName: 'Kitchen',
};

function createGuard(options: {
  required?: string[];
  granted?: string[];
  user?: AuthenticatedUser;
}) {
  const getAllAndOverride = vi.fn().mockReturnValue(options.required);
  const granted = options.granted ?? [];
  const hasAll = vi
    .fn()
    .mockImplementation((_userId: string, required: string[]) =>
      Promise.resolve(required.every((item) => granted.includes(item))),
    );

  const guard = new PermissionsGuard(
    { getAllAndOverride } as unknown as Reflector,
    { hasAll } as unknown as PermissionService,
  );

  const context = {
    getType: () => 'http',
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ user: options.user }),
    }),
  } as unknown as ExecutionContext;

  return { guard, context, hasAll };
}

describe('PermissionsGuard', () => {
  it('allows a route that declares no permissions', async () => {
    const { guard, context, hasAll } = createGuard({ required: undefined });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasAll).not.toHaveBeenCalled();
  });

  it('allows a caller holding the required permission', async () => {
    const { guard, context } = createGuard({
      required: ['kitchen.update'],
      granted: ['kitchen.update'],
      user: kitchenUser,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('denies a caller missing the required permission with 403 semantics', async () => {
    const { guard, context } = createGuard({
      required: ['dispatch.manage'],
      granted: ['kitchen.update'],
      user: kitchenUser,
    });

    const error = (await guard
      .canActivate(context)
      .catch((thrown: unknown) => thrown)) as InsufficientPermissionsError;

    expect(error).toBeInstanceOf(InsufficientPermissionsError);
    expect(error.kind).toBe('forbidden');
    expect(error.details).toEqual({ requiredPermissions: ['dispatch.manage'] });
  });

  it('requires every permission when several are declared', async () => {
    const { guard, context } = createGuard({
      required: ['orders.view', 'dispatch.manage'],
      granted: ['orders.view'],
      user: kitchenUser,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      InsufficientPermissionsError,
    );
  });

  it('allows when all of several required permissions are held', async () => {
    const { guard, context } = createGuard({
      required: ['orders.view', 'dispatch.manage'],
      granted: ['orders.view', 'dispatch.manage', 'delivery.view'],
      user: kitchenUser,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('refuses to authorize an unauthenticated request', async () => {
    const { guard, context } = createGuard({ required: ['orders.view'] });

    await expect(guard.canActivate(context)).rejects.toThrow(
      MissingAuthenticationError,
    );
  });
});
