import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
} from '../src/auth/permissions.js';
import {
  createSeedClient,
  seedAuth,
  STAFF_ACCOUNTS,
  type SeedClient,
} from '../prisma/seed.js';

describe('staff seed (e2e)', () => {
  let prisma: SeedClient;

  beforeAll(async () => {
    prisma = createSeedClient();
    await seedAuth(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function snapshot() {
    return {
      users: await prisma.user.count({
        where: { email: { in: STAFF_ACCOUNTS.map((entry) => entry.email) } },
      }),
      roles: await prisma.role.count({
        where: { name: { in: Object.keys(ROLE_PERMISSIONS) } },
      }),
      permissions: await prisma.permission.count({
        where: { key: { in: [...ALL_PERMISSIONS] } },
      }),
      grants: await prisma.rolePermission.count(),
    };
  }

  it('creates the four required accounts with the right roles', async () => {
    for (const account of STAFF_ACCOUNTS) {
      const user = await prisma.user.findUnique({
        where: { email: account.email },
        select: { active: true, role: { select: { name: true } } },
      });

      expect(user?.role.name).toBe(account.role);
      expect(user?.active).toBe(true);
    }

    expect(
      await prisma.user.count({
        where: { email: { in: STAFF_ACCOUNTS.map((entry) => entry.email) } },
      }),
    ).toBe(4);
  });

  it('grants each role exactly the permissions it should have', async () => {
    for (const [roleName, expected] of Object.entries(ROLE_PERMISSIONS)) {
      const granted = await prisma.permission.findMany({
        where: { roles: { some: { role: { name: roleName } } } },
        select: { key: true },
      });

      expect(granted.map((entry) => entry.key).sort()).toEqual(
        [...expected].sort(),
      );
    }
  });

  it('isolates Kitchen, Dispatch and Driver from each other', async () => {
    const keysFor = async (roleName: string) =>
      (
        await prisma.permission.findMany({
          where: { roles: { some: { role: { name: roleName } } } },
          select: { key: true },
        })
      ).map((entry) => entry.key);

    expect(await keysFor(ROLES.KITCHEN)).not.toContain('dispatch.manage');
    expect(await keysFor(ROLES.DISPATCH)).not.toContain('kitchen.update');
    expect(await keysFor(ROLES.DRIVER)).not.toContain('kitchen.update');
    expect(await keysFor(ROLES.ADMIN)).toContain('users.manage');
  });

  it(
  'does not duplicate anything when run again',
  async () => {
    const before = await snapshot();

    await seedAuth(prisma);
    await seedAuth(prisma);

    expect(await snapshot()).toEqual(before);
  },
  20000,
);
});
