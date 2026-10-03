import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingResolver } from './domain/pricing-resolver.js';
import { BaseTierPercentageStrategy } from './domain/strategies/base-tier-percentage.strategy.js';
import { CostMultiplierStrategy } from './domain/strategies/cost-multiplier.strategy.js';
import { ExplicitPriceStrategy } from './domain/strategies/explicit-price.strategy.js';
import { PricingContextLoader } from './pricing-context.loader.js';
import { PricedItemNotFoundError } from './pricing.errors.js';
import { TierPriceGridService } from './tier-price-grid.service.js';

const STANDARD = {
  id: 'tier-standard',
  code: 'STANDARD',
  name: 'Standard',
  strategy: 'EXPLICIT',
  markupBasisPoints: null,
  baseTierId: null,
};

const ENTERPRISE = {
  id: 'tier-enterprise',
  code: 'ENTERPRISE',
  name: 'Enterprise',
  strategy: 'COST_MULTIPLIER',
  markupBasisPoints: 24_000,
  baseTierId: null,
};

const DISHES = [
  { id: 'dish-curry', sku: 'CURRY', name: 'Curry', costCents: 88 },
  { id: 'dish-wrap', sku: 'WRAP', name: 'Wrap', costCents: 400 },
];

function createPrismaMock() {
  return {
    priceTier: {
      findMany: vi.fn().mockResolvedValue([STANDARD, ENTERPRISE]),
      findUnique: vi.fn().mockResolvedValue({ id: STANDARD.id }),
    },
    dishTierPrice: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    optionTierPrice: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    dish: { findMany: vi.fn().mockResolvedValue(DISHES) },
    option: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  };
}

describe('TierPriceGridService', () => {
  let service: TierPriceGridService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        TierPriceGridService,
        PricingContextLoader,
        PricingResolver,
        ExplicitPriceStrategy,
        CostMultiplierStrategy,
        BaseTierPercentageStrategy,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(TierPriceGridService);
  });

  const query = { page: 1, limit: 20, skip: 0, take: 20 } ;

  it('resolves every row from one loaded context, not one query per row', async () => {
    prisma.dish.findMany.mockResolvedValue(
      Array.from({ length: 300 }, (_, index) => ({
        id: `dish-${index}`,
        sku: `SKU-${index}`,
        name: `Dish ${index}`,
        costCents: 100 + index,
      })),
    );

    const grid = await service.getGrid(ENTERPRISE.id, query);

    expect(grid.meta.total).toBe(300);
    expect(grid.data).toHaveLength(20);
    // One tier query, one explicit-price query, one catalogue query. Nothing
    // scales with the number of rows.
    expect(prisma.priceTier.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.dishTierPrice.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.dish.findMany).toHaveBeenCalledTimes(1);
  });

  it('exposes cost, derived, override, effective and source per row', async () => {
    prisma.dishTierPrice.findMany.mockResolvedValue([
      {
        priceTierId: ENTERPRISE.id,
        dishId: 'dish-wrap',
        priceCents: 1_000,
      },
    ]);

    const grid = await service.getGrid(ENTERPRISE.id, query);
    const [curry, wrap] = grid.data;

    expect(curry).toMatchObject({
      costCents: 88,
      derivedPriceCents: 215,
      overrideCents: null,
      effectivePriceCents: 215,
      source: 'DERIVED',
      missing: false,
    });
    expect(wrap).toMatchObject({
      derivedPriceCents: 960,
      overrideCents: 1_000,
      effectivePriceCents: 1_000,
      source: 'EXPLICIT',
      missing: false,
    });
  });

  it('reports missing prices instead of zero and filters to them', async () => {
    prisma.dishTierPrice.findMany.mockResolvedValue([
      { priceTierId: STANDARD.id, dishId: 'dish-wrap', priceCents: 1_200 },
    ]);

    const all = await service.getGrid(STANDARD.id, query);
    const missingOnly = await service.getGrid(STANDARD.id, {
      ...query,
      missingOnly: true,
    } );

    expect(all.meta.total).toBe(2);
    expect(missingOnly.meta.total).toBe(1);
    expect(missingOnly.data[0]).toMatchObject({
      itemId: 'dish-curry',
      effectivePriceCents: null,
      missing: true,
      missingReason: 'NO_EXPLICIT_PRICE',
      source: null,
    });
  });

  it('writes overrides and clears them in one transaction', async () => {
    await service.bulkSetPrices(STANDARD.id, {
      prices: [
        { itemType: 'dish', itemId: 'dish-curry', priceCents: 1_250 },
        { itemType: 'dish', itemId: 'dish-wrap', priceCents: null },
      ],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.dishTierPrice.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.dishTierPrice.deleteMany).toHaveBeenCalledWith({
      where: { priceTierId: STANDARD.id, dishId: { in: ['dish-wrap'] } },
    });
  });

  it('rejects a price for an item that does not exist', async () => {
    prisma.dish.findMany.mockResolvedValue([]);

    await expect(
      service.bulkSetPrices(STANDARD.id, {
        prices: [{ itemType: 'dish', itemId: 'dish-ghost', priceCents: 100 }],
      }),
    ).rejects.toThrow(PricedItemNotFoundError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
