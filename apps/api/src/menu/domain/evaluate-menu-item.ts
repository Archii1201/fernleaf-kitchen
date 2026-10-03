import { isPriced, type PriceResolution } from '../../pricing/domain/pricing.types.js';
import type {
  MenuCategoryFacts,
  MenuDishFacts,
  MenuItemResolution,
  MenuUnavailableReason,
  MenuViewMode,
} from './menu.types.js';

export interface EvaluateMenuItemInput {
  category: MenuCategoryFacts;
  dish: MenuDishFacts;
  membershipActive: boolean;
  hiddenCategoryIds: ReadonlySet<string>;
  hiddenDishIds: ReadonlySet<string>;
  price: PriceResolution;
  mode: MenuViewMode;
}

/**
 * The single menu-availability function. Preview listing, secret-slug lookup
 * and the future Orders module all call this. Changing a rule here changes
 * every surface at once.
 *
 * First failing check wins. Missing prices are never coerced to 0.
 */
export function evaluateMenuItem(
  input: EvaluateMenuItemInput,
): MenuItemResolution {
  const { category, dish, mode } = input;
  const ids = { dishId: dish.id, categoryId: category.id };

  if (!category.active) {
    return unavailable(ids, 'CATEGORY_INACTIVE');
  }

  if (!dish.active) {
    return unavailable(ids, 'DISH_INACTIVE');
  }

  if (!input.membershipActive) {
    return unavailable(ids, 'MEMBERSHIP_INACTIVE');
  }

  if (input.hiddenCategoryIds.has(category.id)) {
    return unavailable(ids, 'CATEGORY_HIDDEN');
  }

  if (input.hiddenDishIds.has(dish.id)) {
    return unavailable(ids, 'DISH_HIDDEN');
  }

  // Secret categories are omitted from the browse list. A caller who already
  // has the slug (or an order line) uses `direct` and is allowed through.
  if (mode === 'listing' && category.isSecret) {
    return unavailable(ids, 'CATEGORY_SECRET');
  }

  if (!isPriced(input.price)) {
    return unavailable(ids, 'MISSING_PRICE');
  }

  return {
    status: 'AVAILABLE',
    ...ids,
    priceCents: input.price.priceCents,
    source: input.price.source,
  };
}

function unavailable(
  ids: { dishId: string; categoryId: string },
  reason: MenuUnavailableReason,
): MenuItemResolution {
  return {
    status: 'UNAVAILABLE',
    ...ids,
    reason,
    priceCents: null,
    source: null,
  };
}
