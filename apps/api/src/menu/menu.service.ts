import { Injectable } from '@nestjs/common';
import { isAvailable } from './domain/menu.types.js';
import type { MenuPreviewQueryDto } from './dto/menu.dto.js';
import { MenuContextLoader } from './menu-context.loader.js';
import {
  MenuCategoryNotFoundError,
  MenuCategoryUnavailableError,
} from './menu.errors.js';
import { MenuResolver } from './menu.resolver.js';

@Injectable()
export class MenuService {
  constructor(
    private readonly loader: MenuContextLoader,
    private readonly resolver: MenuResolver,
  ) {}

  /** Normal employee/company preview. Secret categories are omitted. */
  async preview(query: MenuPreviewQueryDto) {
    const context = await this.loader.load(query);
    const categories = this.resolver
      .listVisibleCategories(context)
      .filter(
        (entry) => !context.hiddenCategoryIds.has(entry.category.id),
      )
      .map((entry) => ({
        id: entry.category.id,
        slug: entry.category.slug,
        name: entry.category.name,
        isSecret: false,
        dishes: entry.items.map((item) => {
          const dish = context.dishes.get(item.dishId)!;

          return {
            id: dish.id,
            sku: dish.sku,
            name: dish.name,
            description: dish.description,
            priceCents: item.priceCents,
            source: item.source,
          };
        }),
      }));

    return this.envelope(context, categories);
  }

  /**
   * Direct slug lookup. A secret category is returned when the slug is
   * known; inactive/hidden/unpriced rules still apply.
   */
  async previewCategory(slug: string, query: MenuPreviewQueryDto) {
    const context = await this.loader.load(query);
    const category = context.categories.find((entry) => entry.slug === slug);

    if (!category) {
      throw new MenuCategoryNotFoundError(slug);
    }

    if (!category.active) {
      throw new MenuCategoryUnavailableError(slug, 'CATEGORY_INACTIVE');
    }

    if (context.hiddenCategoryIds.has(category.id)) {
      throw new MenuCategoryUnavailableError(slug, 'CATEGORY_HIDDEN');
    }

    const items = this.resolver
      .resolveCategoryItems(context, category.id, 'direct')
      .filter(isAvailable);

    return this.envelope(context, [
      {
        id: category.id,
        slug: category.slug,
        name: category.name,
        isSecret: category.isSecret,
        dishes: items.map((item) => {
          const dish = context.dishes.get(item.dishId)!;

          return {
            id: dish.id,
            sku: dish.sku,
            name: dish.name,
            description: dish.description,
            priceCents: item.priceCents,
            source: item.source,
          };
        }),
      },
    ]);
  }

  /**
   * Order-validation seam. Same resolver, same context, loud errors.
   * The Orders module should call this instead of re-checking visibility.
   */
  async assertOrderable(
    query: MenuPreviewQueryDto,
    items: { dishId: string; categoryId?: string }[],
  ) {
    const context = await this.loader.load(query);

    return {
      companyId: context.company.id,
      priceTierId: context.priceTier.id,
      items: items.map((item) => {
        const resolved = this.resolver.assertDishOrderable(
          context,
          item.dishId,
          item.categoryId,
        );
        const dish = context.dishes.get(item.dishId)!;

        return {
          dishId: dish.id,
          sku: dish.sku,
          name: dish.name,
          categoryId: resolved.categoryId,
          priceCents: resolved.status === 'AVAILABLE' ? resolved.priceCents : null,
          source: resolved.status === 'AVAILABLE' ? resolved.source : null,
          status: resolved.status,
        };
      }),
    };
  }

  private envelope(
    context: Awaited<ReturnType<MenuContextLoader['load']>>,
    categories: unknown[],
  ) {
    return {
      company: { id: context.company.id, name: context.company.name },
      employee: context.employee,
      priceTier: context.priceTier,
      categories,
    };
  }
}
