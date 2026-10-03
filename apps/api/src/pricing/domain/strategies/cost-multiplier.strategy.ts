import { Injectable } from '@nestjs/common';
import { InvalidPricingStrategyError } from '../../pricing.errors.js';
import { Money } from '../money.js';
import type { PriceResolution } from '../pricing.types.js';
import type {
  DerivationInput,
  PriceDerivationStrategy,
} from './price-derivation-strategy.js';

/**
 * Price = internal cost x multiplier, rounded up to the next 5 cents.
 *
 * The multiplier is basis points: 24000 means x2.4. Cost always exists on a
 * dish or option, so this strategy can never produce MISSING.
 */
@Injectable()
export class CostMultiplierStrategy implements PriceDerivationStrategy {
  readonly kind = 'COST_MULTIPLIER' as const;

  derive({ tier, item }: DerivationInput): PriceResolution {
    if (tier.markupBasisPoints === null) {
      throw new InvalidPricingStrategyError(
        'A cost-multiplier tier must define a multiplier.',
        { tierId: tier.id },
      );
    }

    const price = Money.fromCents(item.costCents).scaleByBasisPointsRoundedUp(
      tier.markupBasisPoints,
    );

    return {
      status: 'PRICED',
      priceCents: price.cents,
      source: 'DERIVED',
      resolvedFromTierId: tier.id,
    };
  }
}
