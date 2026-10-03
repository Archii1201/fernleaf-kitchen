import { Injectable } from '@nestjs/common';
import { PricingContext } from './pricing-context.js';
import type {
  PriceResolution,
  PriceTierDefinition,
  PricedItem,
} from './pricing.types.js';
import { BaseTierPercentageStrategy } from './strategies/base-tier-percentage.strategy.js';
import { CostMultiplierStrategy } from './strategies/cost-multiplier.strategy.js';
import { ExplicitPriceStrategy } from './strategies/explicit-price.strategy.js';
import type { PriceDerivationStrategy } from './strategies/price-derivation-strategy.js';
import { MAX_TIER_DERIVATION_DEPTH } from './tier-chain.js';

/**
 * Turns a `PricingContext` plus an item into an effective price or MISSING.
 *
 * Pure: no Prisma, no HTTP, no clock. It reads only the in-memory context, so
 * resolving a thousand grid rows performs zero queries.
 *
 * Resolution order for a tier:
 *   1. an explicit price row on that tier wins outright (manual override);
 *   2. otherwise the tier's strategy derives one, recursing into the base
 *      tier when the strategy needs it;
 *   3. otherwise the item is MISSING at that tier.
 */
@Injectable()
export class PricingResolver {
  private readonly strategies: ReadonlyMap<string, PriceDerivationStrategy>;

  constructor(
    explicitPriceStrategy: ExplicitPriceStrategy,
    costMultiplierStrategy: CostMultiplierStrategy,
    baseTierPercentageStrategy: BaseTierPercentageStrategy,
  ) {
    this.strategies = new Map(
      [
        explicitPriceStrategy,
        costMultiplierStrategy,
        baseTierPercentageStrategy,
      ].map((strategy) => [strategy.kind, strategy]),
    );
  }

  /** Effective price of an item on the context's target tier. */
  resolve(context: PricingContext, item: PricedItem): PriceResolution {
    return this.resolveOnTier(context, item, context.targetTierId, 0);
  }

  /** Price of an item on one specific tier of the loaded chain. */
  resolveOnTier(
    context: PricingContext,
    item: PricedItem,
    tierId: string,
    depth = 0,
  ): PriceResolution {
    if (depth > MAX_TIER_DERIVATION_DEPTH) {
      // Writes are validated, but a chain edited concurrently must degrade to
      // MISSING rather than recurse without end.
      return {
        status: 'MISSING',
        reason: 'DERIVATION_TOO_DEEP',
        missingAtTierId: tierId,
      };
    }

    const tier = context.tier(tierId);
    const override = context.explicitPrice(tier.id, item.type, item.id);

    if (override !== null) {
      return {
        status: 'PRICED',
        priceCents: override,
        source: 'EXPLICIT',
        resolvedFromTierId: tier.id,
      };
    }

    return this.strategyFor(tier).derive({
      tier,
      item,
      basePrice: tier.baseTierId
        ? this.resolveOnTier(context, item, tier.baseTierId, depth + 1)
        : null,
    });
  }

  /**
   * The price a tier would derive if its override were removed. The grid uses
   * it to show what "reset" would restore the row to.
   */
  resolveDerivedOnly(
    context: PricingContext,
    item: PricedItem,
  ): PriceResolution {
    const tier = context.targetTier();

    return this.strategyFor(tier).derive({
      tier,
      item,
      basePrice: tier.baseTierId
        ? this.resolveOnTier(context, item, tier.baseTierId, 1)
        : null,
    });
  }

  private strategyFor(tier: PriceTierDefinition): PriceDerivationStrategy {
    const strategy = this.strategies.get(tier.strategy);

    if (!strategy) {
      throw new Error(`No pricing strategy registered for ${tier.strategy}.`);
    }

    return strategy;
  }
}
