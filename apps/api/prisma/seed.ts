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

/**
 * A small, realistic catalogue. Pricing needs something to price, and the
 * e2e specs need stable rows. Keyed on SKU/code so re-running updates in
 * place instead of duplicating.
 */
const SAMPLE_DISHES = [
  {
    sku: 'FK-CURRY-001',
    name: 'Paneer Butter Curry',
    temperature: 'HOT' as const,
    costCents: 880,
    stationCode: 'HOT_LINE',
    portionCode: 'REGULAR',
    moq: 5,
  },
  {
    sku: 'FK-WRAP-001',
    name: 'Chicken Tikka Wrap',
    temperature: 'HOT' as const,
    costCents: 1_020,
    stationCode: 'HOT_LINE',
    portionCode: 'REGULAR',
    moq: null,
  },
  {
    sku: 'FK-SALAD-001',
    name: 'Garden Salad',
    temperature: 'COLD' as const,
    costCents: 540,
    stationCode: 'COLD_LINE',
    portionCode: 'SMALL',
    moq: null,
  },
  {
    sku: 'FK-SPECIAL-001',
    name: "Chef's Seasonal Special",
    temperature: 'HOT' as const,
    costCents: 760,
    stationCode: 'HOT_LINE',
    portionCode: 'REGULAR',
    moq: null,
  },
];

const SAMPLE_OPTIONS = [
  { code: 'FK-OPT-EXTRA-PANEER', name: 'Extra paneer', costCents: 180 },
  { code: 'FK-OPT-EXTRA-SAUCE', name: 'Extra sauce', costCents: 60 },
];

export async function seedCatalogueSamples(prisma: SeedClient): Promise<void> {
  for (const dish of SAMPLE_DISHES) {
    const station = await prisma.kitchenStation.findUniqueOrThrow({
      where: { code: dish.stationCode },
      select: { id: true },
    });
    const portionSize = await prisma.portionSize.findUniqueOrThrow({
      where: { code: dish.portionCode },
      select: { id: true },
    });

    await prisma.dish.upsert({
      where: { sku: dish.sku },
      update: {
        name: dish.name,
        temperature: dish.temperature,
        costCents: dish.costCents,
        kitchenStationId: station.id,
        portionSizeId: portionSize.id,
        moq: dish.moq,
      },
      create: {
        sku: dish.sku,
        name: dish.name,
        temperature: dish.temperature,
        costCents: dish.costCents,
        kitchenStationId: station.id,
        portionSizeId: portionSize.id,
        moq: dish.moq,
        active: true,
      },
    });
  }

  for (const option of SAMPLE_OPTIONS) {
    await prisma.option.upsert({
      where: { code: option.code },
      update: { name: option.name, costCents: option.costCents },
      create: { ...option, active: true },
    });
  }
}

/**
 * Three tiers that exercise every derivation strategy:
 *
 *   Standard   - the default, manually priced
 *   Enterprise - cost x 2.4 (24000 basis points)
 *   Partner    - Standard + 15% (1500 basis points), with one override
 *
 * `FK-SPECIAL-001` is deliberately left unpriced on Standard so the
 * missing-price path (and therefore the "hidden from the menu" rule) has a
 * real example in every environment.
 */
const STANDARD_DISH_PRICES: Record<string, number> = {
  'FK-CURRY-001': 1_799,
  'FK-WRAP-001': 2_099,
  'FK-SALAD-001': 1_299,
};

const STANDARD_OPTION_PRICES: Record<string, number> = {
  'FK-OPT-EXTRA-PANEER': 350,
};

/** One manual override on a derived tier, to prove overrides win. */
const PARTNER_DISH_OVERRIDES: Record<string, number> = {
  'FK-WRAP-001': 2_250,
};

export async function seedPricing(prisma: SeedClient): Promise<void> {
  const standard = await prisma.priceTier.upsert({
    where: { code: 'STANDARD' },
    // Never reset the default flag or the rule an admin may have changed.
    update: { name: 'Standard' },
    create: {
      code: 'STANDARD',
      name: 'Standard',
      strategy: 'EXPLICIT',
      isDefault: true,
      active: true,
    },
    select: { id: true },
  });

  await prisma.priceTier.upsert({
    where: { code: 'ENTERPRISE' },
    update: { name: 'Enterprise' },
    create: {
      code: 'ENTERPRISE',
      name: 'Enterprise',
      strategy: 'COST_MULTIPLIER',
      markupBasisPoints: 24_000,
      active: true,
    },
    select: { id: true },
  });

  const partner = await prisma.priceTier.upsert({
    where: { code: 'PARTNER' },
    update: { name: 'Partner' },
    create: {
      code: 'PARTNER',
      name: 'Partner',
      strategy: 'BASE_MARKUP',
      markupBasisPoints: 1_500,
      baseTierId: standard.id,
      active: true,
    },
    select: { id: true },
  });

  for (const [sku, priceCents] of Object.entries(STANDARD_DISH_PRICES)) {
    await upsertDishPrice(prisma, sku, standard.id, priceCents);
  }

  for (const [sku, priceCents] of Object.entries(PARTNER_DISH_OVERRIDES)) {
    await upsertDishPrice(prisma, sku, partner.id, priceCents);
  }

  for (const [code, priceCents] of Object.entries(STANDARD_OPTION_PRICES)) {
    const option = await prisma.option.findUnique({
      where: { code },
      select: { id: true },
    });

    if (!option) {
      continue;
    }

    await prisma.optionTierPrice.upsert({
      where: {
        optionId_priceTierId: { optionId: option.id, priceTierId: standard.id },
      },
      update: { priceCents },
      create: { optionId: option.id, priceTierId: standard.id, priceCents },
    });
  }
}

async function upsertDishPrice(
  prisma: SeedClient,
  sku: string,
  priceTierId: string,
  priceCents: number,
): Promise<void> {
  const dish = await prisma.dish.findUnique({
    where: { sku },
    select: { id: true },
  });

  if (!dish) {
    return;
  }

  await prisma.dishTierPrice.upsert({
    where: { dishId_priceTierId: { dishId: dish.id, priceTierId } },
    update: { priceCents },
    create: { dishId: dish.id, priceTierId, priceCents },
  });
}

/**
 * Two sample companies and a handful of employees. Keyed on the globally
 * unique email domain so re-seeding updates in place and never duplicates.
 *
 * Alice starts at Northwind. The e2e suite (and later the Orders step) relies
 * on orders storing their own `companyId`, so moving her later must not
 * rewrite history.
 */
export async function seedCompanies(prisma: SeedClient): Promise<void> {
  const standard = await prisma.priceTier.findUnique({
    where: { code: 'STANDARD' },
    select: { id: true },
  });
  const packaging = await prisma.packagingType.findUnique({
    where: { code: 'INDIVIDUAL' },
    select: { id: true },
  });
  const dairy = await prisma.allergen.findUnique({
    where: { code: 'DAIRY' },
    select: { id: true },
  });
  const vegetarian = await prisma.dietaryTag.findUnique({
    where: { code: 'VEGETARIAN' },
    select: { id: true },
  });

  if (!standard) {
    return;
  }

  const northwind = await upsertSeedCompany(prisma, {
    name: 'Northwind Analytics',
    legalName: 'Northwind Analytics Pvt Ltd',
    domain: 'northwind.com',
    priceTierId: standard.id,
    packagingTypeId: packaging?.id ?? null,
    billingContactName: 'Priya Shah',
    billingContactEmail: 'billing@northwind.com',
    address: {
      label: 'Head office',
      line1: '1 Residency Road',
      city: 'Bengaluru',
      postalCode: '560025',
    },
  });

  const contoso = await upsertSeedCompany(prisma, {
    name: 'Contoso Foods',
    legalName: 'Contoso Foods LLP',
    domain: 'contoso.com',
    priceTierId: standard.id,
    packagingTypeId: packaging?.id ?? null,
    billingContactName: 'Rahul Sen',
    billingContactEmail: 'accounts@contoso.com',
    address: {
      label: 'Kitchen dock',
      line1: '14 Industrial Layout',
      city: 'Bengaluru',
      postalCode: '560095',
    },
  });

  const alice = await upsertSeedEmployee(prisma, {
    companyId: northwind.id,
    email: 'alice@northwind.com',
    fullName: 'Alice Mehta',
    defaultAddressId: northwind.addressId,
    canChooseAddress: true,
    canChooseDeliveryTime: true,
    canChoosePackaging: false,
    allergenId: dairy?.id ?? null,
    dietaryTagId: vegetarian?.id ?? null,
  });

  await upsertSeedEmployee(prisma, {
    companyId: contoso.id,
    email: 'bob@contoso.com',
    fullName: 'Bob Iyer',
    defaultAddressId: contoso.addressId,
    canChooseAddress: false,
    canChooseDeliveryTime: false,
    canChoosePackaging: false,
    allergenId: null,
    dietaryTagId: null,
  });

  if (northwind.ownerEmployeeId !== alice.id) {
    await prisma.company.update({
      where: { id: northwind.id },
      data: { ownerEmployeeId: alice.id },
    });
  }
}

async function upsertSeedCompany(
  prisma: SeedClient,
  input: {
    name: string;
    legalName: string;
    domain: string;
    priceTierId: string;
    packagingTypeId: string | null;
    billingContactName: string;
    billingContactEmail: string;
    address: {
      label: string;
      line1: string;
      city: string;
      postalCode: string;
    };
  },
): Promise<{ id: string; addressId: string; ownerEmployeeId: string | null }> {
  const existingDomain = await prisma.companyDomain.findUnique({
    where: { domain: input.domain },
    select: { companyId: true },
  });

  const company = existingDomain
  ? await prisma.company.update({
      where: { id: existingDomain.companyId },
      data: {
        name: input.name,
        legalName: input.legalName,
        priceTierId: input.priceTierId,
        billingContactName: input.billingContactName,
        billingContactEmail: input.billingContactEmail,
      },
      select: { id: true, ownerEmployeeId: true },
    })
    : await prisma.company.create({
        data: {
          name: input.name,
          legalName: input.legalName,
          priceTierId: input.priceTierId,
          billingContactName: input.billingContactName,
          billingContactEmail: input.billingContactEmail,
          defaultPackagingTypeId: input.packagingTypeId,
          leaveKitchenMinutes: 30,
          defaultDeliveryTime: new Date('1970-01-01T12:30:00.000Z'),
          active: true,
          domains: { create: { domain: input.domain } },
          workingDays: {
            create: DEFAULT_WORKING_WEEK.map((weekday) => ({ weekday })),
          },
        },
        select: { id: true, ownerEmployeeId: true },
      });

  const address = await prisma.companyAddress.findFirst({
    where: { companyId: company.id, label: input.address.label },
    select: { id: true },
  });

  const savedAddress =
    address ??
    (await prisma.companyAddress.create({
      data: {
        companyId: company.id,
        ...input.address,
        country: 'IN',
        active: true,
      },
      select: { id: true },
    }));

  if (!existingDomain) {
    await prisma.company.update({
      where: { id: company.id },
      data: { defaultAddressId: savedAddress.id },
    });
  }

  return {
    id: company.id,
    addressId: savedAddress.id,
    ownerEmployeeId: company.ownerEmployeeId,
  };
}

async function upsertSeedEmployee(
  prisma: SeedClient,
  input: {
    companyId: string;
    email: string;
    fullName: string;
    defaultAddressId: string;
    canChooseAddress: boolean;
    canChooseDeliveryTime: boolean;
    canChoosePackaging: boolean;
    allergenId: string | null;
    dietaryTagId: string | null;
  },
): Promise<{ id: string }> {
  const employee = await prisma.customerEmployee.upsert({
    where: { email: input.email },
    update: {
      fullName: input.fullName,
      companyId: input.companyId,
      defaultAddressId: input.defaultAddressId,
      canChooseAddress: input.canChooseAddress,
      canChooseDeliveryTime: input.canChooseDeliveryTime,
      canChoosePackaging: input.canChoosePackaging,
    },
    create: {
      companyId: input.companyId,
      email: input.email,
      fullName: input.fullName,
      defaultAddressId: input.defaultAddressId,
      canChooseAddress: input.canChooseAddress,
      canChooseDeliveryTime: input.canChooseDeliveryTime,
      canChoosePackaging: input.canChoosePackaging,
      active: true,
    },
    select: { id: true },
  });

  if (input.allergenId) {
    await prisma.customerEmployeeAllergen.upsert({
      where: {
        customerEmployeeId_allergenId: {
          customerEmployeeId: employee.id,
          allergenId: input.allergenId,
        },
      },
      update: {},
      create: {
        customerEmployeeId: employee.id,
        allergenId: input.allergenId,
      },
    });
  }

  if (input.dietaryTagId) {
    await prisma.customerEmployeeDietaryTag.upsert({
      where: {
        customerEmployeeId_dietaryTagId: {
          customerEmployeeId: employee.id,
          dietaryTagId: input.dietaryTagId,
        },
      },
      update: {},
      create: {
        customerEmployeeId: employee.id,
        dietaryTagId: input.dietaryTagId,
      },
    });
  }

  return employee;
}

/**
 * Menu sections the resolver browses. `off-menu` is secret: omitted from the
 * normal listing, reachable by slug. The seasonal special is left unpriced
 * on Standard so the missing-price path is real.
 */
const SAMPLE_CATEGORIES = [
  {
    slug: 'mains',
    name: 'Mains',
    displayOrder: 0,
    isSecret: false,
    dishSkus: ['FK-CURRY-001', 'FK-WRAP-001'],
  },
  {
    slug: 'salads',
    name: 'Salads',
    displayOrder: 1,
    isSecret: false,
    dishSkus: ['FK-SALAD-001'],
  },
  {
    slug: 'off-menu',
    name: 'Off menu',
    displayOrder: 2,
    isSecret: true,
    dishSkus: ['FK-SPECIAL-001'],
  },
];

export async function seedMenu(prisma: SeedClient): Promise<void> {
  for (const category of SAMPLE_CATEGORIES) {
    const saved = await prisma.menuCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        displayOrder: category.displayOrder,
        isSecret: category.isSecret,
        active: true,
      },
      create: {
        slug: category.slug,
        name: category.name,
        displayOrder: category.displayOrder,
        isSecret: category.isSecret,
        active: true,
      },
      select: { id: true },
    });

    for (const [index, sku] of category.dishSkus.entries()) {
      const dish = await prisma.dish.findUnique({
        where: { sku },
        select: { id: true },
      });

      if (!dish) {
        continue;
      }

      await prisma.menuCategoryDish.upsert({
        where: {
          menuCategoryId_dishId: {
            menuCategoryId: saved.id,
            dishId: dish.id,
          },
        },
        update: { displayOrder: index, active: true },
        create: {
          menuCategoryId: saved.id,
          dishId: dish.id,
          displayOrder: index,
          active: true,
        },
      });
    }
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
    await seedCatalogueSamples(prisma);
    await seedMenu(prisma);
    await seedPricing(prisma);
    await seedCompanies(prisma);
    console.log(
      `Seeded ${Object.keys(ROLE_PERMISSIONS).length} roles, ` +
        `${ALL_PERMISSIONS.length} permissions and ${STAFF_ACCOUNTS.length} staff users, ` +
        'plus kitchen settings, catalogue, price tiers, sample companies and employees.',
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
