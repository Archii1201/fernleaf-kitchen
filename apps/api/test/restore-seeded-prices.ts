import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Re-asserts the seed's Standard grid that other e2e files mutate:
 * Curry 1799, Special unpriced. Safe to call from any spec's beforeAll.
 */
export async function restoreSeededStandardDishPrices(
  prisma: PrismaService,
): Promise<void> {
  const standard = await prisma.priceTier.findUnique({
    where: { code: 'STANDARD' },
    select: { id: true },
  });
  const curry = await prisma.dish.findUnique({
    where: { sku: 'FK-CURRY-001' },
    select: { id: true },
  });
  const special = await prisma.dish.findUnique({
    where: { sku: 'FK-SPECIAL-001' },
    select: { id: true },
  });

  if (!standard || !curry) {
    return;
  }

  await prisma.dishTierPrice.upsert({
    where: {
      dishId_priceTierId: { dishId: curry.id, priceTierId: standard.id },
    },
    update: { priceCents: 1_799 },
    create: {
      dishId: curry.id,
      priceTierId: standard.id,
      priceCents: 1_799,
    },
  });

  if (special) {
    await prisma.dishTierPrice.deleteMany({
      where: { priceTierId: standard.id, dishId: special.id },
    });
  }
}
