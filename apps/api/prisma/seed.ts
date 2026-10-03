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
export const STAFF_ACCOUNTS: ReadonlyArray<{
  email: string;
  role: RoleName;
  staffCode: string;
  fullName: string;
}> = [
  {
    email: 'admin@test.com',
    role: ROLES.ADMIN,
    staffCode: 'ADMIN-001',
    fullName: 'Fernleaf Admin',
  },
  {
    email: 'kitchen@test.com',
    role: ROLES.KITCHEN,
    staffCode: 'KITCHEN-001',
    fullName: 'Kitchen Lead',
  },
  {
    email: 'dispatch@test.com',
    role: ROLES.DISPATCH,
    staffCode: 'DISPATCH-001',
    fullName: 'Dispatch Coordinator',
  },
  {
    email: 'driver@test.com',
    role: ROLES.DRIVER,
    staffCode: 'DRIVER-001',
    fullName: 'Delivery Driver',
  },
];

export const SEED_PASSWORD = 'Test@1234';

/** Client type used by the seed functions and by their tests. */
export type SeedClient = PrismaClient;

/**
 * Idempotent seed of roles, permissions and the four staff logins.
 *
 * Every write is an upsert keyed on a natural unique column (permission key,
 * role name, user email), and role grants are reconciled rather than appended,
 * so running this repeatedly converges on the same state instead of
 * duplicating rows.
 */
export async function seedAuth(prisma: SeedClient): Promise<void> {
  await seedPermissions(prisma);
  await seedRolesWithGrants(prisma);
  await seedStaffUsers(prisma);
}

async function seedPermissions(prisma: SeedClient): Promise<void> {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }
}

async function seedRolesWithGrants(prisma: SeedClient): Promise<void> {
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

async function seedStaffUsers(prisma: SeedClient): Promise<void> {
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
      const created = await prisma.user.create({
        data: {
          email: account.email,
          passwordHash: await bcrypt.hash(SEED_PASSWORD, PASSWORD_SALT_ROUNDS),
          roleId: role.id,
          active: true,
        },
        select: { id: true },
      });

      await upsertStaffProfile(prisma, created.id, account);
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

    await upsertStaffProfile(prisma, existing.id, account);
  }
}

/**
 * Staff accounts also get the operational profile that Step 5's staff
 * endpoints edit. Keyed on the unique `userId`, so re-seeding updates in place.
 */
async function upsertStaffProfile(
  prisma: SeedClient,
  userId: string,
  account: (typeof STAFF_ACCOUNTS)[number],
): Promise<void> {
  await prisma.staff.upsert({
    where: { userId },
    update: { staffCode: account.staffCode, fullName: account.fullName },
    create: {
      userId,
      staffCode: account.staffCode,
      fullName: account.fullName,
      active: true,
    },
  });
}

/** Default cutoff: 16:00 local, two kitchen working days before delivery. */
export const DEFAULT_CUTOFF_TIME = new Date('1970-01-01T16:00:00.000Z');
export const DEFAULT_CUTOFF_WORKING_DAYS = 2;
export const SETTINGS_SINGLETON_ID = 'singleton';

const DEFAULT_WORKING_WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
] as const;

/**
 * Kitchen settings and the working week. `update: {}` keeps an admin's later
 * changes intact: re-seeding must not silently reset the cutoff.
 */
export async function seedKitchenSettings(prisma: SeedClient): Promise<void> {
  await prisma.kitchenSettings.upsert({
    where: { id: SETTINGS_SINGLETON_ID },
    update: {},
    create: {
      id: SETTINGS_SINGLETON_ID,
      cutoffTime: DEFAULT_CUTOFF_TIME,
      cutoffWorkingDays: DEFAULT_CUTOFF_WORKING_DAYS,
    },
  });

  for (const weekday of DEFAULT_WORKING_WEEK) {
    await prisma.kitchenWorkingDay.upsert({
      where: { weekday },
      update: {},
      create: { weekday },
    });
  }
}

const ALLERGENS = [
  { code: 'GLUTEN', name: 'Gluten' },
  { code: 'DAIRY', name: 'Dairy' },
  { code: 'NUTS', name: 'Tree nuts' },
  { code: 'PEANUTS', name: 'Peanuts' },
  { code: 'SOY', name: 'Soy' },
  { code: 'EGG', name: 'Egg' },
];

const DIETARY_TAGS = [
  { code: 'VEGETARIAN', name: 'Vegetarian' },
  { code: 'VEGAN', name: 'Vegan' },
  { code: 'HALAL', name: 'Halal' },
  { code: 'GLUTEN_FREE', name: 'Gluten free' },
];

const KITCHEN_STATIONS = [
  { code: 'HOT_LINE', name: 'Hot line', sortOrder: 0 },
  { code: 'COLD_LINE', name: 'Cold line', sortOrder: 1 },
  { code: 'BAKERY', name: 'Bakery', sortOrder: 2 },
  { code: 'PACKING', name: 'Packing', sortOrder: 3 },
];

const PORTION_SIZES = [
  { code: 'SMALL', name: 'Small', sortOrder: 0 },
  { code: 'REGULAR', name: 'Regular', sortOrder: 1 },
  { code: 'LARGE', name: 'Large', sortOrder: 2 },
];

const PACKAGING_TYPES = [
  { code: 'INDIVIDUAL', name: 'Individually packed' },
  { code: 'BUFFET', name: 'Buffet trays' },
  { code: 'BULK', name: 'Bulk containers' },
];

/** Reference lookups the catalogue depends on. Keyed on their unique codes. */
export async function seedReferenceData(prisma: SeedClient): Promise<void> {
  for (const allergen of ALLERGENS) {
    await prisma.allergen.upsert({
      where: { code: allergen.code },
      update: { name: allergen.name },
      create: allergen,
    });
  }

  for (const tag of DIETARY_TAGS) {
    await prisma.dietaryTag.upsert({
      where: { code: tag.code },
      update: { name: tag.name },
      create: tag,
    });
  }

  for (const station of KITCHEN_STATIONS) {
    await prisma.kitchenStation.upsert({
      where: { code: station.code },
      update: { name: station.name, sortOrder: station.sortOrder },
      create: station,
    });
  }

  for (const portionSize of PORTION_SIZES) {
    await prisma.portionSize.upsert({
      where: { code: portionSize.code },
      update: { name: portionSize.name, sortOrder: portionSize.sortOrder },
      create: portionSize,
    });
  }

  for (const packagingType of PACKAGING_TYPES) {
    await prisma.packagingType.upsert({
      where: { code: packagingType.code },
      update: { name: packagingType.name },
      create: packagingType,
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
    await seedKitchenSettings(prisma);
    await seedReferenceData(prisma);
    console.log(
      `Seeded ${Object.keys(ROLE_PERMISSIONS).length} roles, ` +
        `${ALL_PERMISSIONS.length} permissions and ${STAFF_ACCOUNTS.length} staff users, ` +
        'plus kitchen settings and catalogue reference data.',
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
