import { Injectable } from '@nestjs/common';
import { isPriced } from '../../pricing/domain/pricing.types.js';
import type { PricingContext } from '../../pricing/domain/pricing-context.js';
import { PricingResolver } from '../../pricing/domain/pricing-resolver.js';
import { PriceNotAvailableError } from '../orders.errors.js';
import type { BuiltCombination, BuiltOption } from './order-types.js';

export interface PricedOptionInput {
  optionId: string;
  optionGroupId: string;
  optionGroupName: string;
  optionName: string;
  costCents: number;
}

@Injectable()
export class OrderPricer {
  constructor(private readonly pricing: PricingResolver) {}

  priceOption(
    context: PricingContext,
    option: PricedOptionInput,
  ): BuiltOption {
    const resolved = this.pricing.resolve(context, {
      id: option.optionId,
      type: 'option',
      costCents: option.costCents,
    });

    if (!isPriced(resolved)) {
      throw new PriceNotAvailableError('option', option.optionId);
    }

    return {
      optionId: option.optionId,
      optionGroupId: option.optionGroupId,
      optionGroupName: option.optionGroupName,
      optionName: option.optionName,
      optionPriceCents: resolved.priceCents,
    };
  }

  priceCombination(
    dishPriceCents: number,
    quantity: number,
    signature: string,
    options: BuiltOption[],
  ): BuiltCombination {
    const optionsPriceCents = options.reduce(
      (sum, option) => sum + option.optionPriceCents,
      0,
    );
    const unitPriceCents = dishPriceCents + optionsPriceCents;

    return {
      quantity,
      signature,
      unitPriceCents,
      optionsPriceCents,
      totalCents: unitPriceCents * quantity,
      options,
    };
  }

  lineTotals(combinations: readonly BuiltCombination[]): {
    unitPriceCents: number;
    lineTotalCents: number;
  } {
    const lineTotalCents = combinations.reduce(
      (sum, combination) => sum + combination.totalCents,
      0,
    );
    const quantity = combinations.reduce(
      (sum, combination) => sum + combination.quantity,
      0,
    );

    return {
      unitPriceCents: quantity === 0 ? 0 : Math.trunc(lineTotalCents / quantity),
      lineTotalCents,
    };
  }
}
