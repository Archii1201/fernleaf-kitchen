import { describe, expect, it } from 'vitest';
import { PricingContext } from '../pricing/domain/pricing-context.js';
import { PricingResolver } from '../pricing/domain/pricing-resolver.js';
import { BaseTierPercentageStrategy } from '../pricing/domain/strategies/base-tier-percentage.strategy.js';
import { CostMultiplierStrategy } from '../pricing/domain/strategies/cost-multiplier.strategy.js';
import { ExplicitPriceStrategy } from '../pricing/domain/strategies/explicit-price.strategy.js';
import type { MenuContext } from './domain/menu-context.js';
import type { MenuCategoryFacts, MenuDishFacts } from './domain/menu.types.js';
import { DishNotOrderableError } from './menu.errors.js';
import { MenuResolver } from './menu.resolver.js';

const TIER = {
  id: 'tier-standard',
  code: 'STANDARD',
  name: 'Standard',
  strategy: 'EXPLICIT' as const,
  markupBasisPoints: null,
  baseTierId: null,
};

const MAINS: MenuCategoryFacts = {
  id: 'cat-mains',
  slug: 'mains',
  name: 'Mains',
  displayOrder: 0,
  isSecret: false,
  active: true,
};

const SECRET: MenuCategoryFacts = {
  id: 'cat-secret',
  slug: 'off-menu',
  name: 'Off menu',
  displayOrder: 1,
  isSecret: true,
  active: true,
};

const CURRY: MenuDishFacts = {
  id: 'dish-curry',
  sku: 'CURRY',
  name: 'Curry',
  description: null,
  costCents: 880,
  active: true,
};

const SPECIAL: MenuDishFacts = {
  id: 'dish-special',
  sku: 'SPECIAL',
  name: 'Special',
  description: null,
  costCents: 760,
  active: true,
};

const WRAP: MenuDishFacts = {
  id: 'dish-wrap',
  sku: 'WRAP',
  name: 'Wrap',
  description: null,
  costCents: 400,
  active: true,
};

function context(overrides: Partial<MenuContext> = {}): MenuContext {
  const pricing = new PricingContext(
    TIER.id,
    [TIER],
    [
      {
        tierId: TIER.id,
        itemType: 'dish',
        itemId: CURRY.id,
        priceCents: 1_799,
      },
      {
        tierId: TIER.id,
        itemType: 'dish',
        itemId: WRAP.id,
        priceCents: 2_099,
      },
    ],
  );

  return {
    company: { id: 'co-1', name: 'Northwind', priceTierId: TIER.id },
    employee: { id: 'emp-1', fullName: 'Alice', email: 'alice@northwind.com' },
    priceTier: { id: TIER.id, code: TIER.code, name: TIER.name },
    hiddenCategoryIds: new Set(),
    hiddenDishIds: new Set(),
    categories: [MAINS, SECRET],
    dishes: new Map([
      [CURRY.id, CURRY],
      [WRAP.id, WRAP],
      [SPECIAL.id, SPECIAL],
    ]),
    memberships: [
      { categoryId: MAINS.id, dishId: CURRY.id, displayOrder: 0, active: true },
      { categoryId: MAINS.id, dishId: WRAP.id, displayOrder: 1, active: true },
      {
        categoryId: SECRET.id,
        dishId: SPECIAL.id,
        displayOrder: 0,
        active: true,
      },
    ],
    pricing,
    ...overrides,
  };
}

describe('MenuResolver', () => {
  const resolver = new MenuResolver(
    new PricingResolver(
      new ExplicitPriceStrategy(),
      new CostMultiplierStrategy(),
      new BaseTierPercentageStrategy(),
    ),
  );

  it('resolves the employee/company menu from the loaded context', () => {
    const loaded = context();
    const listed = resolver.listVisibleCategories(loaded);

    expect(loaded.employee?.id).toBe('emp-1');
    expect(loaded.company.id).toBe('co-1');
    expect(listed.map((entry) => entry.category.slug)).toEqual(['mains']);
    expect(listed[0].items.every((item) => item.status === 'AVAILABLE')).toBe(
      true,
    );
  });

  it('resolves many dishes from one shared context without extra lookups', () => {
    const loaded = context();
    const first = resolver.resolveItem(loaded, MAINS.id, CURRY.id, 'listing');
    const second = resolver.resolveItem(loaded, MAINS.id, WRAP.id, 'listing');

    expect(first?.status).toBe('AVAILABLE');
    expect(second?.status).toBe('AVAILABLE');
    expect(loaded.pricing.targetTierId).toBe(TIER.id);
  });

  it('lets the order seam accept a dish from a secret category', () => {
    const pricedSecret = context({
      pricing: new PricingContext(TIER.id, [TIER], [
        {
          tierId: TIER.id,
          itemType: 'dish',
          itemId: SPECIAL.id,
          priceCents: 999,
        },
      ]),
    });

    const result = resolver.assertDishOrderable(pricedSecret, SPECIAL.id);

    expect(result.status).toBe('AVAILABLE');
    if (result.status === 'AVAILABLE') {
      expect(result.priceCents).toBe(999);
    }
  });

  it('rejects an unpriced dish on the order seam', () => {
    expect(() => resolver.assertDishOrderable(context(), SPECIAL.id)).toThrow(
      DishNotOrderableError,
    );
  });
});
