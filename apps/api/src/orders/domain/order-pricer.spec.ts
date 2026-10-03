import { describe, expect, it } from 'vitest';
import { PricingContext } from '../../pricing/domain/pricing-context.js';
import { PricingResolver } from '../../pricing/domain/pricing-resolver.js';
import { BaseTierPercentageStrategy } from '../../pricing/domain/strategies/base-tier-percentage.strategy.js';
import { CostMultiplierStrategy } from '../../pricing/domain/strategies/cost-multiplier.strategy.js';
import { ExplicitPriceStrategy } from '../../pricing/domain/strategies/explicit-price.strategy.js';
import { PriceNotAvailableError } from '../orders.errors.js';
import { OrderPricer } from './order-pricer.js';

const TIER = {
  id: 'standard',
  code: 'STANDARD',
  name: 'Standard',
  strategy: 'EXPLICIT' as const,
  markupBasisPoints: null,
  baseTierId: null,
};

describe('OrderPricer', () => {
  const resolver = new PricingResolver(
    new ExplicitPriceStrategy(),
    new CostMultiplierStrategy(),
    new BaseTierPercentageStrategy(),
  );
  const pricer = new OrderPricer(resolver);

  it('adds option cents to the dish price and multiplies by quantity', () => {
    const context = new PricingContext(TIER.id, [TIER], [
      {
        tierId: TIER.id,
        itemType: 'option',
        itemId: 'opt-1',
        priceCents: 350,
      },
    ]);

    const option = pricer.priceOption(context, {
      optionId: 'opt-1',
      optionGroupId: 'g1',
      optionGroupName: 'Extras',
      optionName: 'Paneer',
      costCents: 180,
    });
    const combination = pricer.priceCombination(1_799, 2, 'opt-1', [option]);

    expect(combination.unitPriceCents).toBe(2_149);
    expect(combination.totalCents).toBe(4_298);
    expect(pricer.lineTotals([combination]).lineTotalCents).toBe(4_298);
  });

  it('never treats a missing option price as zero', () => {
    const context = new PricingContext(TIER.id, [TIER], []);

    expect(() =>
      pricer.priceOption(context, {
        optionId: 'opt-missing',
        optionGroupId: 'g1',
        optionGroupName: 'Extras',
        optionName: 'Ghost',
        costCents: 10,
      }),
    ).toThrow(PriceNotAvailableError);
  });
});
