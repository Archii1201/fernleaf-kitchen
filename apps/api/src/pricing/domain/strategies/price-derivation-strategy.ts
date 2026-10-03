import type {
  PriceResolution,
  PriceTierDefinition,
  PricedItem,
  PricingStrategyKind,
} from '../pricing.types.js';

export interface DerivationInput {
  tier: PriceTierDefinition;
  item: PricedItem;
  /**
   * Price already resolved on the tier's base, or null when the base has none.
   * The resolver computes it; a strategy never queries anything itself.
   */
  basePrice: PriceResolution | null;
}

/**
 * How a tier produces a price for an item that has no explicit override.
 *
 * One strategy per `PricingStrategy` enum value. Adding a pricing rule means
 * adding a class here and registering it, not editing a switch in a service.
 */
export interface PriceDerivationStrategy {
  readonly kind: PricingStrategyKind;

  derive(input: DerivationInput): PriceResolution;
}
