import { BaseTierNotFoundError } from '../pricing.errors.js';
import type {
  ExplicitPriceRow,
  PriceTierDefinition,
  PricedItemType,
} from './pricing.types.js';

function priceKey(
  tierId: string,
  itemType: PricedItemType,
  itemId: string,
): string {
  return `${tierId}:${itemType}:${itemId}`;
}

/**
 * Everything the resolver needs, loaded once.
 *
 * This is the answer to the performance rule: the tier chain and every
 * explicit price on that chain are fetched in a fixed number of queries before
 * resolution starts, so pricing a grid of 500 dishes costs the same number of
 * round trips as pricing one.
 */
export class PricingContext {
  private readonly tiers: ReadonlyMap<string, PriceTierDefinition>;
  private readonly explicitPrices: ReadonlyMap<string, number>;

  constructor(
    readonly targetTierId: string,
    tiers: readonly PriceTierDefinition[],
    explicitPrices: readonly ExplicitPriceRow[],
  ) {
    this.tiers = new Map(tiers.map((tier) => [tier.id, tier]));
    this.explicitPrices = new Map(
      explicitPrices.map((row) => [
        priceKey(row.tierId, row.itemType, row.itemId),
        row.priceCents,
      ]),
    );
  }

  tier(tierId: string): PriceTierDefinition {
    const tier = this.tiers.get(tierId);

    if (!tier) {
      // The loader walks the chain, so a gap here means the chain it was built
      // from is inconsistent rather than that the caller asked for nonsense.
      throw new BaseTierNotFoundError(tierId);
    }

    return tier;
  }

  targetTier(): PriceTierDefinition {
    return this.tier(this.targetTierId);
  }

  /** The target tier followed by each base tier, root last. */
  chain(): PriceTierDefinition[] {
    const chain: PriceTierDefinition[] = [];
    const seen = new Set<string>();

    let current: PriceTierDefinition | undefined = this.targetTier();

    while (current && !seen.has(current.id)) {
      chain.push(current);
      seen.add(current.id);
      current = current.baseTierId
        ? this.tier(current.baseTierId)
        : undefined;
    }

    return chain;
  }

  explicitPrice(
    tierId: string,
    itemType: PricedItemType,
    itemId: string,
  ): number | null {
    return this.explicitPrices.get(priceKey(tierId, itemType, itemId)) ?? null;
  }
}
