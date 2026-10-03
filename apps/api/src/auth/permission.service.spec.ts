import { vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PermissionService } from './permission.service.js';

function createService(keys: string[]) {
  const findMany = vi
    .fn()
    .mockResolvedValue(keys.map((key) => ({ key })));

  const service = new PermissionService({
    permission: { findMany },
  } as unknown as PrismaService);

  return { service, findMany };
}

describe('PermissionService', () => {
  it('resolves permissions through role and role-permission links', async () => {
    const { service, findMany } = createService(['orders.view']);

    await expect(service.getPermissionKeys('user-1')).resolves.toEqual([
      'orders.view',
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          roles: {
            some: { role: { users: { some: { id: 'user-1', active: true } } } },
          },
        },
      }),
    );
  });

  it('allows a user holding every required permission', async () => {
    const { service } = createService(['orders.view', 'orders.edit']);

    await expect(
      service.hasAll('user-1', ['orders.view', 'orders.edit']),
    ).resolves.toBe(true);
  });

  it('denies when any required permission is missing', async () => {
    const { service } = createService(['orders.view']);

    await expect(
      service.hasAll('user-1', ['orders.view', 'orders.edit']),
    ).resolves.toBe(false);
  });

  it('denies a user with no permissions', async () => {
    const { service } = createService([]);

    await expect(service.hasAll('user-1', ['orders.view'])).resolves.toBe(false);
  });

  it('does not query when nothing is required', async () => {
    const { service, findMany } = createService(['orders.view']);

    await expect(service.hasAll('user-1', [])).resolves.toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });
});
