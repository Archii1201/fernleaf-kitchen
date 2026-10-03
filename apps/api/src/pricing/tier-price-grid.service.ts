import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  paginate,
  type PaginatedResponse,
} from '../common/pagination/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PricingContext } from './domain/pricing-context.js';
import { PricingResolver } from './domain/pricing-resolver.js';
import {
  isPriced,
  type PricedItem,
  type PricedItemType,
} from './domain/pricing.types.js';
import type {
  BulkSetTierPricesDto,
  BulkSetTierPricesResponse,
  TierPriceGridQueryDto,
  TierPriceGridRow,
} from './dto/tier-price-grid.dto.js';
import { PricingContextLoader } from './pricing-context.loader.js';
import {
  DuplicatePriceEntryError,
  PriceTierNotFoundError,
  PricedItemNotFoundError,
} from './pricing.errors.js';

interface CatalogueItem extends PricedItem {
  reference: string;
  name: string;
}

@Injectable()
export class TierPriceGridService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextLoader: PricingContextLoader,
    private readonly resolver: PricingResolver,
  ) {}

  /**
   * The whole-tier price grid.
   *
   * Three queries regardless of row count: the tier table, the explicit prices
   * on the tier chain, and the catalogue items matching the search. Every
   * price is then resolved in memory from that context.
   *
   * `missingOnly` is applied after resolution and the page is sliced in
   * memory, because "missing" is a property of the derivation chain and
   * cannot be expressed as a SQL predicate. The catalogue is small enough
   * (hundreds of rows) for that to be the right trade; the alternative is
   * materialising derived prices into a table and keeping them in sync.
   */
  async getGrid(
    tierId: string,
    query: TierPriceGridQueryDto,
  ): Promise<PaginatedResponse<TierPriceGridRow>> {
    const itemType: PricedItemType = query.type ?? 'dish';
    const context = await this.contextLoader.loadForTier(tierId, [itemType]);
    const items = await this.loadItems(itemType, query.q);

    const rows = items.map((item) => this.toRow(context, item));
    const filtered = query.missingOnly ? rows.filter((row) => row.missing) : rows;
    const page = filtered.slice(query.skip, query.skip + query.take);

    return paginate(page, {
      page: query.page,
      limit: query.limit,
      total: filtered.length,
    });
  }

  /**
   * Bulk override editing. `priceCents: null` deletes the override so the row
   * falls back to whatever the tier rule derives.
   *
   * The whole batch is one transaction: a partially applied price grid is a
   * worse outcome than a rejected save, because the operator cannot see which
   * half landed.
   */
  async bulkSetPrices(
    tierId: string,
    dto: BulkSetTierPricesDto,
  ): Promise<BulkSetTierPricesResponse> {
    const tier = await this.prisma.priceTier.findUnique({
      where: { id: tierId },
      select: { id: true },
    });

    if (!tier) {
      throw new PriceTierNotFoundError(tierId);
    }

    const seen = new Set<string>();

    for (const entry of dto.prices) {
      const key = `${entry.itemType}:${entry.itemId}`;

      if (seen.has(key)) {
        throw new DuplicatePriceEntryError(entry.itemType, entry.itemId);
      }

      seen.add(key);
    }

    await this.assertItemsExist('dish', dto.prices);
    await this.assertItemsExist('option', dto.prices);

    const toSet = dto.prices.filter((entry) => entry.priceCents !== null);
    const toClear = dto.prices.filter((entry) => entry.priceCents === null);

    await this.prisma.$transaction(async (tx) => {
      for (const entry of toSet) {
        const priceCents = entry.priceCents as number;

        if (entry.itemType === 'dish') {
          await tx.dishTierPrice.upsert({
            where: {
              dishId_priceTierId: { dishId: entry.itemId, priceTierId: tierId },
            },
            update: { priceCents },
            create: { dishId: entry.itemId, priceTierId: tierId, priceCents },
          });
        } else {
          await tx.optionTierPrice.upsert({
            where: {
              optionId_priceTierId: {
                optionId: entry.itemId,
                priceTierId: tierId,
              },
            },
            update: { priceCents },
            create: { optionId: entry.itemId, priceTierId: tierId, priceCents },
          });
        }
      }

      const dishIdsToClear = toClear
        .filter((entry) => entry.itemType === 'dish')
        .map((entry) => entry.itemId);
      const optionIdsToClear = toClear
        .filter((entry) => entry.itemType === 'option')
        .map((entry) => entry.itemId);

      if (dishIdsToClear.length > 0) {
        await tx.dishTierPrice.deleteMany({
          where: { priceTierId: tierId, dishId: { in: dishIdsToClear } },
        });
      }

      if (optionIdsToClear.length > 0) {
        await tx.optionTierPrice.deleteMany({
          where: { priceTierId: tierId, optionId: { in: optionIdsToClear } },
        });
      }
    });

    return { updated: toSet.length, cleared: toClear.length };
  }

  private toRow(
    context: PricingContext,
    item: CatalogueItem,
  ): TierPriceGridRow {
    const override = context.explicitPrice(
      context.targetTierId,
      item.type,
      item.id,
    );
    const derived = this.resolver.resolveDerivedOnly(context, item);
    const effective = this.resolver.resolve(context, item);

    return {
      itemType: item.type,
      itemId: item.id,
      reference: item.reference,
      name: item.name,
      costCents: item.costCents,
      derivedPriceCents: isPriced(derived) ? derived.priceCents : null,
      overrideCents: override,
      effectivePriceCents: isPriced(effective) ? effective.priceCents : null,
      source: isPriced(effective) ? effective.source : null,
      missing: !isPriced(effective),
      missingReason: isPriced(effective) ? null : effective.reason,
      resolvedFromTierId: isPriced(effective)
        ? effective.resolvedFromTierId
        : null,
    };
  }

  private async loadItems(
    itemType: PricedItemType,
    search?: string,
  ): Promise<CatalogueItem[]> {
    const contains = search
      ? { contains: search, mode: 'insensitive' as const }
      : undefined;

    if (itemType === 'dish') {
      const where: Prisma.DishWhereInput = contains
        ? { OR: [{ name: contains }, { sku: contains }] }
        : {};

      const dishes = await this.prisma.dish.findMany({
        where,
        select: { id: true, sku: true, name: true, costCents: true },
        orderBy: { name: 'asc' },
      });

      return dishes.map((dish) => ({
        id: dish.id,
        type: 'dish' as const,
        costCents: dish.costCents,
        reference: dish.sku,
        name: dish.name,
      }));
    }

    const where: Prisma.OptionWhereInput = contains
      ? { OR: [{ name: contains }, { code: contains }] }
      : {};

    const options = await this.prisma.option.findMany({
      where,
      select: { id: true, code: true, name: true, costCents: true },
      orderBy: { name: 'asc' },
    });

    return options.map((option) => ({
      id: option.id,
      type: 'option' as const,
      costCents: option.costCents,
      reference: option.code,
      name: option.name,
    }));
  }

  private async assertItemsExist(
    itemType: PricedItemType,
    entries: BulkSetTierPricesDto['prices'],
  ): Promise<void> {
    const ids = [
      ...new Set(
        entries
          .filter((entry) => entry.itemType === itemType)
          .map((entry) => entry.itemId),
      ),
    ];

    if (ids.length === 0) {
      return;
    }

    const found =
      itemType === 'dish'
        ? await this.prisma.dish.findMany({
            where: { id: { in: ids } },
            select: { id: true },
          })
        : await this.prisma.option.findMany({
            where: { id: { in: ids } },
            select: { id: true },
          });

    const foundIds = new Set(found.map((row) => row.id));
    const missing = ids.filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      throw new PricedItemNotFoundError(itemType, missing);
    }
  }
}
