import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingContext } from './domain/pricing-context.js';
import type {
  ExplicitPriceRow,
  PriceTierDefinition,
  PricedItemType,
} from './domain/pricing.types.js';
import { PriceTierNotFoundError } from './pricing.errors.js';

/**
 * Builds a `PricingContext` with a fixed number of queries, whatever the size
 * of the catalogue being priced:
 *
 *   1 query for the tier table (a handful of rows; the chain is walked in
 *   memory), then 1 query per item type for the explicit prices on the tiers
 *   in the chain.
 *
 * Nothing here is per dish or per option. That is the whole reason the loader
 * is separate from the resolver.
 */
@Injectable()
export class PricingContextLoader {
  constructor(private readonly prisma: PrismaService) {}

  async loadTiers(): Promise<PriceTierDefinition[]> {
    const tiers = await this.prisma.priceTier.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        strategy: true,
        markupBasisPoints: true,
        baseTierId: true,
      },
      orderBy: { name: 'asc' },
    });

    return tiers as PriceTierDefinition[];
  }

  async loadForTier(
    tierId: string,
    itemTypes: readonly PricedItemType[] = ['dish', 'option'],
  ): Promise<PricingContext> {
    const tiers = await this.loadTiers();

    if (!tiers.some((tier) => tier.id === tierId)) {
      throw new PriceTierNotFoundError(tierId);
    }

    const chainIds = chainTierIds(tiers, tierId);
    const explicitPrices: ExplicitPriceRow[] = [];

    if (itemTypes.includes('dish')) {
      const rows = await this.prisma.dishTierPrice.findMany({
        where: { priceTierId: { in: chainIds } },
        select: { priceTierId: true, dishId: true, priceCents: true },
      });

      explicitPrices.push(
        ...rows.map((row) => ({
          tierId: row.priceTierId,
          itemType: 'dish' as const,
          itemId: row.dishId,
          priceCents: row.priceCents,
        })),
      );
    }

    if (itemTypes.includes('option')) {
      const rows = await this.prisma.optionTierPrice.findMany({
        where: { priceTierId: { in: chainIds } },
        select: { priceTierId: true, optionId: true, priceCents: true },
      });

      explicitPrices.push(
        ...rows.map((row) => ({
          tierId: row.priceTierId,
          itemType: 'option' as const,
          itemId: row.optionId,
          priceCents: row.priceCents,
        })),
      );
    }

    return new PricingContext(tierId, tiers, explicitPrices);
  }
}

/** Tier ids from the target up to the root, defensively stopping on a cycle. */
export function chainTierIds(
  tiers: readonly PriceTierDefinition[],
  tierId: string,
): string[] {
  const byId = new Map(tiers.map((tier) => [tier.id, tier]));
  const chain: string[] = [];
  const seen = new Set<string>();

  let currentId: string | null = tierId;

  while (currentId !== null && !seen.has(currentId)) {
    chain.push(currentId);
    seen.add(currentId);
    currentId = byId.get(currentId)?.baseTierId ?? null;
  }

  return chain;
}
