import { describe, expect, it } from 'vitest';
import type { PriceResolution } from '../../pricing/domain/pricing.types.js';
import { evaluateMenuItem } from './evaluate-menu-item.js';
import type { MenuCategoryFacts, MenuDishFacts } from './menu.types.js';

const CATEGORY: MenuCategoryFacts = {
  id: 'cat-mains',
  slug: 'mains',
  name: 'Mains',
  displayOrder: 0,
  isSecret: false,
  active: true,
};

const SECRET: MenuCategoryFacts = {
  ...CATEGORY,
  id: 'cat-secret',
  slug: 'off-menu',
  name: 'Off menu',
  isSecret: true,
};

const DISH: MenuDishFacts = {
  id: 'dish-curry',
  sku: 'FK-CURRY-001',
  name: 'Paneer Butter Curry',
  description: null,
  costCents: 880,
  active: true,
};

const PRICED: PriceResolution = {
  status: 'PRICED',
  priceCents: 1_799,
  source: 'EXPLICIT',
  resolvedFromTierId: 'tier-standard',
};

const MISSING: PriceResolution = {
  status: 'MISSING',
  reason: 'NO_EXPLICIT_PRICE',
  missingAtTierId: 'tier-standard',
};

function evaluate(
  overrides: Partial<Parameters<typeof evaluateMenuItem>[0]> = {},
) {
  return evaluateMenuItem({
    category: CATEGORY,
    dish: DISH,
    membershipActive: true,
    hiddenCategoryIds: new Set(),
    hiddenDishIds: new Set(),
    price: PRICED,
    mode: 'listing',
    ...overrides,
  });
}

describe('evaluateMenuItem', () => {
  it('marks an active category + active priced dish available', () => {
    const result = evaluate();

    expect(result).toMatchObject({
      status: 'AVAILABLE',
      priceCents: 1_799,
      source: 'EXPLICIT',
    });
  });

  it('rejects an inactive category', () => {
    expect(evaluate({ category: { ...CATEGORY, active: false } })).toMatchObject(
      { status: 'UNAVAILABLE', reason: 'CATEGORY_INACTIVE' },
    );
  });

  it('rejects an inactive dish', () => {
    expect(evaluate({ dish: { ...DISH, active: false } })).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'DISH_INACTIVE',
    });
  });

  it('rejects a company-hidden category', () => {
    expect(
      evaluate({ hiddenCategoryIds: new Set([CATEGORY.id]) }),
    ).toMatchObject({ status: 'UNAVAILABLE', reason: 'CATEGORY_HIDDEN' });
  });

  it('rejects a company-hidden dish', () => {
    expect(evaluate({ hiddenDishIds: new Set([DISH.id]) })).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'DISH_HIDDEN',
    });
  });

  it('returns the resolved price when pricing succeeds', () => {
    const result = evaluate({ price: PRICED });

    expect(result.status).toBe('AVAILABLE');
    if (result.status === 'AVAILABLE') {
      expect(result.priceCents).toBe(1_799);
    }
  });

  it('treats a missing price as unavailable, never zero', () => {
    const result = evaluate({ price: MISSING });

    expect(result).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'MISSING_PRICE',
      priceCents: null,
    });
    expect(JSON.stringify(result)).not.toContain('"priceCents":0');
  });

  it('excludes a secret category from the normal listing', () => {
    expect(evaluate({ category: SECRET, mode: 'listing' })).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'CATEGORY_SECRET',
    });
  });

  it('allows a secret category on a direct slug lookup', () => {
    expect(evaluate({ category: SECRET, mode: 'direct' })).toMatchObject({
      status: 'AVAILABLE',
      priceCents: 1_799,
    });
  });

  it('still rejects an inactive secret category on direct lookup', () => {
    expect(
      evaluate({
        category: { ...SECRET, active: false },
        mode: 'direct',
      }),
    ).toMatchObject({ reason: 'CATEGORY_INACTIVE' });
  });

  it('still rejects a hidden secret category on direct lookup', () => {
    expect(
      evaluate({
        category: SECRET,
        mode: 'direct',
        hiddenCategoryIds: new Set([SECRET.id]),
      }),
    ).toMatchObject({ reason: 'CATEGORY_HIDDEN' });
  });

  it('still rejects a secret category whose dish has no price', () => {
    expect(
      evaluate({ category: SECRET, mode: 'direct', price: MISSING }),
    ).toMatchObject({ reason: 'MISSING_PRICE', priceCents: null });
  });

  it('rejects an inactive membership even when dish and category are active', () => {
    expect(evaluate({ membershipActive: false })).toMatchObject({
      reason: 'MEMBERSHIP_INACTIVE',
    });
  });
});
