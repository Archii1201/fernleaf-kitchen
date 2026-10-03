import { Injectable } from '@nestjs/common';
import { PricingResolver } from '../pricing/domain/pricing-resolver.js';
import { evaluateMenuItem } from './domain/evaluate-menu-item.js';
import {
  membershipsForCategory,
  membershipsForDish,
  type MenuContext,
} from './domain/menu-context.js';
import {
  isAvailable,
  type MenuItemResolution,
  type MenuViewMode,
} from './domain/menu.types.js';
import { DishNotOrderableError } from './menu.errors.js';

/**
 * Shared menu availability service.
 *
 * Preview and (later) order validation must call this — never a second copy
 * of the active/hidden/pricing rules. The function is pure once a
 * `MenuContext` is in hand; the loader is the only thing that talks to Prisma.
 */
@Injectable()
export class MenuResolver {
  constructor(private readonly pricingResolver: PricingResolver) {}

  resolveItem(
    context: MenuContext,
    categoryId: string,
    dishId: string,
    mode: MenuViewMode,
  ): MenuItemResolution | null {
    const category = context.categories.find((entry) => entry.id === categoryId);
    const dish = context.dishes.get(dishId);
    const membership = context.memberships.find(
      (entry) => entry.categoryId === categoryId && entry.dishId === dishId,
    );

    if (!category || !dish || !membership) {
      return null;
    }

    const price = this.pricingResolver.resolve(context.pricing, {
      id: dish.id,
      type: 'dish',
      costCents: dish.costCents,
    });

    return evaluateMenuItem({
      category,
      dish,
      membershipActive: membership.active,
      hiddenCategoryIds: context.hiddenCategoryIds,
      hiddenDishIds: context.hiddenDishIds,
      price,
      mode,
    });
  }

  /**
   * Dishes a category would show in the given mode. Unavailable rows are
   * returned so tests and the order seam can see *why*; HTTP preview filters
   * to AVAILABLE.
   */
  resolveCategoryItems(
    context: MenuContext,
    categoryId: string,
    mode: MenuViewMode,
  ): MenuItemResolution[] {
    return membershipsForCategory(context, categoryId)
      .map((membership) =>
        this.resolveItem(context, membership.categoryId, membership.dishId, mode),
      )
      .filter((entry): entry is MenuItemResolution => entry !== null);
  }

  /** Normal browse: secret categories never appear. */
  listVisibleCategories(context: MenuContext) {
    return context.categories
      .filter((category) => !category.isSecret)
      .map((category) => ({
        category,
        items: this.resolveCategoryItems(context, category.id, 'listing').filter(
          isAvailable,
        ),
      }))
      .filter((entry) => entry.category.active);
  }

  /**
   * Order-validation seam. A dish is orderable when at least one category
   * path (including a secret one) evaluates AVAILABLE. Orders must not
   * re-check active/hidden/pricing themselves.
   */
  assertDishOrderable(
    context: MenuContext,
    dishId: string,
    categoryId?: string,
  ): MenuItemResolution {
    const candidates = categoryId
      ? [this.resolveItem(context, categoryId, dishId, 'direct')]
      : membershipsForDish(context, dishId).map((membership) =>
          this.resolveItem(context, membership.categoryId, dishId, 'direct'),
        );

    const resolved = candidates.filter(
      (entry): entry is MenuItemResolution => entry !== null,
    );
    const available = resolved.find(isAvailable);

    if (available) {
      return available;
    }

    const reason = resolved[0]?.reason ?? 'DISH_INACTIVE';

    throw new DishNotOrderableError(dishId, reason, categoryId);
  }
}
