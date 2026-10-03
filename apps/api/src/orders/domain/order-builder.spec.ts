import { describe, expect, it, vi } from 'vitest';
import { CombinationValidator } from '../../catalogue/combinations/combination-validator.js';
import { PricingContext } from '../../pricing/domain/pricing-context.js';
import { PricingResolver } from '../../pricing/domain/pricing-resolver.js';
import { BaseTierPercentageStrategy } from '../../pricing/domain/strategies/base-tier-percentage.strategy.js';
import { CostMultiplierStrategy } from '../../pricing/domain/strategies/cost-multiplier.strategy.js';
import { ExplicitPriceStrategy } from '../../pricing/domain/strategies/explicit-price.strategy.js';
import { DishNotOrderableError } from '../../menu/menu.errors.js';
import { MinimumOrderQuantityNotMetError } from '../../catalogue/combinations/combination.errors.js';
import { OrderBuilder } from './order-builder.js';
import { OrderPricer } from './order-pricer.js';

const TIER = {
  id: 'standard',
  code: 'STANDARD',
  name: 'Standard',
  strategy: 'EXPLICIT' as const,
  markupBasisPoints: null,
  baseTierId: null,
};

const delivery = {
  companyId: 'co-1',
  companyName: 'Northwind',
  customerEmployeeId: 'emp-1',
  employeeName: 'Alice',
  employeeEmail: 'alice@northwind.com',
  deliveryDate: '2031-03-05',
  deliveryTime: '12:30',
  deliveryAddressId: 'addr-1',
  deliveryAddressLabel: 'HQ',
  deliveryAddressLine1: '1 Road',
  deliveryAddressLine2: null,
  deliveryAddressCity: 'Bengaluru',
  deliveryAddressState: null,
  deliveryAddressPostalCode: '560025',
  deliveryAddressCountry: 'IN',
  packagingTypeId: null,
  packagingTypeName: null,
  leaveKitchenMinutes: 60,
  defaultDriverStaffId: null,
};

describe('OrderBuilder', () => {
  const pricing = new PricingContext(TIER.id, [TIER], []);
  const pricer = new OrderPricer(
    new PricingResolver(
      new ExplicitPriceStrategy(),
      new CostMultiplierStrategy(),
      new BaseTierPercentageStrategy(),
    ),
  );

  function createBuilder(overrides: {
    assertDish?: ReturnType<typeof vi.fn>;
    dish?: Record<string, unknown>;
  } = {}) {
    const menuResolver = {
      assertDishOrderable:
        overrides.assertDish ??
        vi.fn().mockReturnValue({
          status: 'AVAILABLE',
          dishId: 'dish-wrap',
          categoryId: 'cat',
          priceCents: 2_099,
          source: 'EXPLICIT',
        }),
    };
    const prisma = {
      dish: {
        findUnique: vi.fn().mockResolvedValue(
          overrides.dish ?? {
            id: 'dish-wrap',
            sku: 'FK-WRAP-001',
            name: 'Wrap',
            description: null,
            temperature: 'HOT',
            costCents: 1020,
            moq: null,
            active: true,
            kitchenStation: { id: 'st', code: 'HOT_LINE', name: 'Hot' },
            optionGroups: [],
          },
        ),
      },
    };

    return new OrderBuilder(
      prisma as never,
      { resolve: vi.fn().mockResolvedValue(delivery) } as never,
      {
        load: vi.fn().mockResolvedValue({
          priceTier: TIER,
          pricing,
        }),
      } as never,
      menuResolver as never,
      new CombinationValidator(),
      pricer,
      {
        assertBeforeCutoff: vi.fn().mockResolvedValue({ hasPassed: false }),
        evaluate: vi.fn().mockResolvedValue({ hasPassed: false }),
      } as never,
    );
  }

  const dto = {
    customerEmployeeId: 'emp-1',
    deliveryDate: '2031-03-05',
    lines: [
      {
        dishId: 'dish-wrap',
        quantity: 2,
        combinations: [{ quantity: 2, selections: [] }],
      },
    ],
  };

  it('snapshots prices, totals and station data', async () => {
    const { order } = await createBuilder().build(dto);

    expect(order.subtotalCents).toBe(4_198);
    expect(order.totalCents).toBe(4_198);
    expect(order.lines[0]?.unitPriceCents).toBe(2_099);
    expect(order.lines[0]?.kitchenStationCode).toBe('HOT_LINE');
    expect(order.priceTierName).toBe('Standard');
    expect(order.lines[0]?.combinations[0]?.signature).toBe('no-options');
  });

  it('rejects an unavailable dish from MenuResolver', async () => {
    const builder = createBuilder({
      assertDish: vi.fn().mockImplementation(() => {
        throw new DishNotOrderableError('dish-x', 'DISH_HIDDEN');
      }),
    });

    await expect(builder.build(dto)).rejects.toBeInstanceOf(DishNotOrderableError);
  });

  it('enforces MOQ through CombinationValidator', async () => {
    const builder = createBuilder({
      dish: {
        id: 'dish-curry',
        sku: 'FK-CURRY-001',
        name: 'Curry',
        description: null,
        temperature: 'HOT',
        costCents: 880,
        moq: 5,
        active: true,
        kitchenStation: { id: 'st', code: 'HOT_LINE', name: 'Hot' },
        optionGroups: [],
      },
    });

    await expect(
      builder.build({
        ...dto,
        lines: [
          {
            dishId: 'dish-curry',
            quantity: 1,
            combinations: [{ quantity: 1, selections: [] }],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(MinimumOrderQuantityNotMetError);
  });
});
