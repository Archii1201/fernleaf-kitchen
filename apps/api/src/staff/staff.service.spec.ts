import { vi } from 'vitest';
import type { PasswordService } from '../auth/password.service.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { PaginationQueryDto } from '../common/pagination/index.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  InvalidRoleError,
  SelfDeactivationForbiddenError,
  SelfRoleDowngradeForbiddenError,
  StaffEmailConflictError,
  StaffNotFoundError,
  StaffProfileNotFoundError,
} from './staff.errors.js';
import { StaffService } from './staff.service.js';

const admin: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@test.com',
  roleId: 'role-admin',
  roleName: 'Admin',
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'staff-1',
    email: 'chef@test.com',
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    role: { id: 'role-kitchen', name: 'Kitchen' },
    staff: {
      staffCode: 'CHEF-002',
      fullName: 'Asha Menon',
      phone: null,
      jobTitle: null,
    },
    ...overrides,
  };
}

function createService(prisma: Record<string, unknown>) {
  const hash = vi.fn().mockResolvedValue('$2b$12$hashed');

  const service = new StaffService(
    prisma as unknown as PrismaService,
    { hash } as unknown as PasswordService,
  );

  return { service, hash };
}

function query(page: number, limit: number): PaginationQueryDto {
  const dto = new PaginationQueryDto();
  dto.page = page;
  dto.limit = limit;

  return dto;
}

describe('StaffService.list', () => {
  it('paginates with the shared pagination utilities', async () => {
    const findMany = vi.fn().mockResolvedValue([row()]);
    const { service } = createService({
      user: { count: vi.fn().mockResolvedValue(42), findMany },
    });

    const result = await service.list(query(3, 10));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
    expect(result.meta).toEqual({
      page: 3,
      limit: 10,
      total: 42,
      totalPages: 5,
    });
    expect(result.data[0]).toMatchObject({
      email: 'chef@test.com',
      role: { name: 'Kitchen' },
      profile: { staffCode: 'CHEF-002' },
    });
  });

  it('never selects or returns a password hash', async () => {
    const findMany = vi.fn().mockResolvedValue([row()]);
    const { service } = createService({
      user: { count: vi.fn().mockResolvedValue(1), findMany },
    });

    const result = await service.list(query(1, 20));

    const select = (findMany.mock.calls[0][0] as { select: object }).select;
    expect(select).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });
});

describe('StaffService.getById', () => {
  it('returns the staff member', async () => {
    const { service } = createService({
      user: { findUnique: vi.fn().mockResolvedValue(row()) },
    });

    await expect(service.getById('staff-1')).resolves.toMatchObject({
      id: 'staff-1',
    });
  });

  it('throws 404 semantics for an unknown id', async () => {
    const { service } = createService({
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    });

    const error = (await service
      .getById('missing')
      .catch((thrown: unknown) => thrown)) as StaffNotFoundError;

    expect(error).toBeInstanceOf(StaffNotFoundError);
    expect(error.kind).toBe('not_found');
  });
});

describe('StaffService.create', () => {
  const dto = {
    email: 'chef@test.com',
    password: 'Test@1234',
    roleId: 'role-kitchen',
    staffCode: 'CHEF-002',
    fullName: 'Asha Menon',
  };

  function prismaForCreate(options: { existingEmail?: boolean } = {}) {
    const userCreate = vi.fn().mockResolvedValue({ id: 'staff-1' });
    const staffCreate = vi.fn().mockResolvedValue({ id: 'profile-1' });
    const findUniqueOrThrow = vi.fn().mockResolvedValue(row());

    return {
      prisma: {
        role: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ permissions: [] }),
        },
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValue(options.existingEmail ? { id: 'other' } : null),
        },
        $transaction: vi.fn(
          (callback: (tx: unknown) => unknown) =>
            callback({
              user: { create: userCreate, findUniqueOrThrow },
              staff: { create: staffCreate },
            }) as unknown,
        ),
      },
      userCreate,
      staffCreate,
    };
  }

  it('hashes the password and never returns it', async () => {
    const { prisma, userCreate } = prismaForCreate();
    const { service, hash } = createService(prisma);

    const result = await service.create(dto);

    expect(hash).toHaveBeenCalledWith('Test@1234');
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: '$2b$12$hashed' }),
      }),
    );
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(result)).not.toContain('$2b$');
  });

  it('creates the linked staff profile', async () => {
    const { prisma, staffCreate } = prismaForCreate();
    const { service } = createService(prisma);

    await service.create(dto);

    expect(staffCreate).toHaveBeenCalledWith({
      data: {
        userId: 'staff-1',
        staffCode: 'CHEF-002',
        fullName: 'Asha Menon',
        phone: null,
        jobTitle: null,
      },
    });
  });

  it('rejects a duplicate email with 409 semantics', async () => {
    const { prisma } = prismaForCreate({ existingEmail: true });
    const { service, hash } = createService(prisma);

    const error = (await service
      .create(dto)
      .catch((thrown: unknown) => thrown)) as StaffEmailConflictError;

    expect(error).toBeInstanceOf(StaffEmailConflictError);
    expect(error.kind).toBe('conflict');
    expect(hash).not.toHaveBeenCalled();
  });

  it('rejects an unknown role with 400 semantics', async () => {
    const { service } = createService({
      role: { findUnique: vi.fn().mockResolvedValue(null) },
    });

    const error = (await service
      .create(dto)
      .catch((thrown: unknown) => thrown)) as InvalidRoleError;

    expect(error).toBeInstanceOf(InvalidRoleError);
    expect(error.kind).toBe('validation');
  });
});

describe('StaffService.updateProfile', () => {
  it('updates only the provided profile fields', async () => {
    const update = vi.fn().mockResolvedValue({});
    const { service } = createService({
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'staff-1', staff: { id: 'profile-1' } })
          .mockResolvedValueOnce(row()),
      },
      staff: { update },
    });

    await service.updateProfile('staff-1', { jobTitle: 'Head chef' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: { jobTitle: 'Head chef' },
    });
  });

  it('fails when the account has no profile', async () => {
    const { service } = createService({
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'staff-1', staff: null }),
      },
    });

    await expect(
      service.updateProfile('staff-1', { fullName: 'New Name' }),
    ).rejects.toThrow(StaffProfileNotFoundError);
  });
});

describe('StaffService.updateRole', () => {
  function prismaForRole(roleKeys: string[]) {
    return {
      role: {
        findUnique: vi.fn().mockResolvedValue({
          permissions: roleKeys.map((key) => ({ permission: { key } })),
        }),
      },
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'staff-1' })
          .mockResolvedValueOnce(row()),
        update: vi.fn().mockResolvedValue({}),
      },
    };
  }

  it('changes the role of another staff member', async () => {
    const prisma = prismaForRole([]);
    const { service } = createService(prisma);

    await service.updateRole('staff-1', 'role-kitchen', admin);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { roleId: 'role-kitchen' },
    });
  });

  it('refuses to remove the caller\u2019s own staff-management capability', async () => {
    const prisma = prismaForRole([PERMISSIONS.ORDERS_VIEW]);
    const { service } = createService(prisma);

    const error = (await service
      .updateRole(admin.id, 'role-kitchen', admin)
      .catch((thrown: unknown) => thrown)) as SelfRoleDowngradeForbiddenError;

    expect(error).toBeInstanceOf(SelfRoleDowngradeForbiddenError);
    expect(error.kind).toBe('forbidden');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows the caller to move to another role that can still manage staff', async () => {
    const prisma = prismaForRole([PERMISSIONS.STAFF_MANAGE]);
    const { service } = createService(prisma);

    await expect(
      service.updateRole(admin.id, 'role-admin-2', admin),
    ).resolves.toBeDefined();
    expect(prisma.user.update).toHaveBeenCalled();
  });
});

describe('StaffService.updateActive', () => {
  function prismaForActive() {
    return {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'staff-1' })
          .mockResolvedValueOnce(row({ active: false })),
        update: vi.fn().mockResolvedValue({}),
      },
    };
  }

  it('deactivates another staff member', async () => {
    const prisma = prismaForActive();
    const { service } = createService(prisma);

    const result = await service.updateActive('staff-1', false, admin);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { active: false },
    });
    expect(result.active).toBe(false);
  });

  it('reactivates a staff member', async () => {
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'staff-1' })
          .mockResolvedValueOnce(row({ active: true })),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const { service } = createService(prisma);

    const result = await service.updateActive('staff-1', true, admin);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { active: true },
    });
    expect(result.active).toBe(true);
  });

  it('refuses to let the caller deactivate themselves', async () => {
    const prisma = prismaForActive();
    const { service } = createService(prisma);

    const error = (await service
      .updateActive(admin.id, false, admin)
      .catch((thrown: unknown) => thrown)) as SelfDeactivationForbiddenError;

    expect(error).toBeInstanceOf(SelfDeactivationForbiddenError);
    expect(error.kind).toBe('forbidden');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('still lets the caller reactivate their own account', async () => {
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: admin.id })
          .mockResolvedValueOnce(row({ id: admin.id, active: true })),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const { service } = createService(prisma);

    await expect(
      service.updateActive(admin.id, true, admin),
    ).resolves.toMatchObject({ active: true });
  });
});
