import { Injectable } from '@nestjs/common';
import { InvalidPricingStrategyError } from '../../pricing.errors.js';
import { BASIS_POINTS_SCALE, Money } from '../money.js';
import { isPriced, type PriceResolution } from '../pricing.types.js';
import type {
  DerivationInput,
  PriceDerivationStrategy,
} from './price-derivation-strategy.js';

/**
 * Price = base tier's price + a percentage, rounded up to the next 5 cents.
 *
 * "Standard + 15%" is 1500 basis points, applied as a 11500/10000 scale so the
 * percentage never becomes a float.
 *
 * If the base tier has no price for the item, the derived tier has no price
 * either. Propagating MISSING (instead of falling back to cost or zero) is
 * what stops an unpriced dish leaking into a derived tier's menu.
 */
@Injectable()
export class BaseTierPercentageStrategy implements PriceDerivationStrategy {
  readonly kind = 'BASE_MARKUP' as const;

  derive({ tier, basePrice }: DerivationInput): PriceResolution {
    if (tier.markupBasisPoints === null) {
      throw new InvalidPricingStrategyError(
        'A base-markup tier must define a markup percentage.',
        { tierId: tier.id },
      );
    }

    if (basePrice === null) {
      throw new InvalidPricingStrategyError(
        'A base-markup tier must define the tier it derives from.',
        { tierId: tier.id },
      );
    }

    if (!isPriced(basePrice)) {
      return basePrice;
    }

    const price = Money.fromCents(
      basePrice.priceCents,
    ).scaleByBasisPointsRoundedUp(BASIS_POINTS_SCALE + tier.markupBasisPoints);

    return {
      status: 'PRICED',
      priceCents: price.cents,
      source: 'DERIVED',
      resolvedFromTierId: tier.id,
    };
  }
}
