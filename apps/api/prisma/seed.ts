import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PASSWORD_SALT_ROUNDS } from '../src/auth/auth.constants.js';
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  type RoleName,
} from '../src/auth/permissions.js';

/** The four staff accounts required by the assignment. */
export const STAFF_ACCOUNTS: ReadonlyArray<{ email: string; role: RoleName }> = [
  { email: 'admin@test.com', role: ROLES.ADMIN },
  { email: 'kitchen@test.com', role: ROLES.KITCHEN },
  { email: 'dispatch@test.com', role: ROLES.DISPATCH },
  { email: 'driver@test.com', role: ROLES.DRIVER },
];

export const SEED_PASSWORD = 'Test@1234';

/**
 * Idempotent seed of roles, permissions and the four staff logins.
 *
 * Every write is an upsert keyed on a natural unique column (permission key,
 * role name, user email), and role grants are reconciled rather than appended,
 * so running this repeatedly converges on the same state instead of
 * duplicating rows.
 */
export async function seedAuth(prisma: PrismaClient): Promise<void> {
  await seedPermissions(prisma);
  await seedRolesWithGrants(prisma);
  await seedStaffUsers(prisma);
}

async function seedPermissions(prisma: PrismaClient): Promise<void> {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }
}

async function seedRolesWithGrants(prisma: PrismaClient): Promise<void> {
  for (const [roleName, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });

    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...permissionKeys] } },
      select: { id: true },
    });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }

    // Reconcile: a permission removed from the catalogue above must also be
    // revoked here, otherwise re-seeding would only ever widen a role.
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: permissions.map((entry) => entry.id) },
      },
    });
  }
}

async function seedStaffUsers(prisma: PrismaClient): Promise<void> {
  for (const account of STAFF_ACCOUNTS) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: account.role },
      select: { id: true },
    });

    const existing = await prisma.user.findUnique({
      where: { email: account.email },
      select: { id: true, passwordHash: true },
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          email: account.email,
          passwordHash: await bcrypt.hash(SEED_PASSWORD, PASSWORD_SALT_ROUNDS),
          roleId: role.id,
          active: true,
        },
      });
      continue;
    }

    // Only re-hash when the stored hash no longer matches the seed password;
    // bcrypt output is salted, so comparing hashes directly would always
    // differ and rewrite the row on every run.
    const passwordMatches = await bcrypt.compare(
      SEED_PASSWORD,
      existing.passwordHash,
    );

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        roleId: role.id,
        active: true,
        ...(passwordMatches
          ? {}
          : {
              passwordHash: await bcrypt.hash(
                SEED_PASSWORD,
                PASSWORD_SALT_ROUNDS,
              ),
            }),
      },
    });
  }
}

export function createSeedClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

async function main(): Promise<void> {
  const prisma = createSeedClient();

  try {
    await seedAuth(prisma);
    console.log(
      `Seeded ${Object.keys(ROLE_PERMISSIONS).length} roles, ` +
        `${ALL_PERMISSIONS.length} permissions and ${STAFF_ACCOUNTS.length} staff users.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  await main();
}
