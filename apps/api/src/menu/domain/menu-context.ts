import type { PricingContext } from '../../pricing/domain/pricing-context.js';
import type {
  MenuCategoryFacts,
  MenuDishFacts,
  MenuMembershipFacts,
} from './menu.types.js';

/**
 * Everything the resolver needs, loaded in a fixed number of queries.
 * Resolving 200 dishes after this costs zero extra round trips.
 */
export interface MenuContext {
  company: { id: string; name: string; priceTierId: string };
  employee: { id: string; fullName: string; email: string } | null;
  priceTier: { id: string; code: string; name: string };
  hiddenCategoryIds: ReadonlySet<string>;
  hiddenDishIds: ReadonlySet<string>;
  categories: readonly MenuCategoryFacts[];
  dishes: ReadonlyMap<string, MenuDishFacts>;
  memberships: readonly MenuMembershipFacts[];
  pricing: PricingContext;
}

export function membershipsForCategory(
  context: MenuContext,
  categoryId: string,
): MenuMembershipFacts[] {
  return context.memberships
    .filter((entry) => entry.categoryId === categoryId)
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

export function membershipsForDish(
  context: MenuContext,
  dishId: string,
): MenuMembershipFacts[] {
  return context.memberships.filter((entry) => entry.dishId === dishId);
}
