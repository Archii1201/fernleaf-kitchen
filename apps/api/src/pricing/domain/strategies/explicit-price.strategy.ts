import { Injectable } from '@nestjs/common';
import type { PriceResolution } from '../pricing.types.js';
import type {
  DerivationInput,
  PriceDerivationStrategy,
} from './price-derivation-strategy.js';

/**
 * A manually priced tier. There is nothing to derive: either an explicit price
 * row exists (the resolver has already returned it) or the item is MISSING.
 *
 * Returning MISSING rather than 0 is the whole point - a dish with no price on
 * the employee's tier must disappear from the menu, not appear as free.
 */
@Injectable()
export class ExplicitPriceStrategy implements PriceDerivationStrategy {
  readonly kind = 'EXPLICIT' as const;

  derive({ tier }: DerivationInput): PriceResolution {
    return {
      status: 'MISSING',
      reason: 'NO_EXPLICIT_PRICE',
      missingAtTierId: tier.id,
    };
  }
}
