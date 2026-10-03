import { Module } from '@nestjs/common';
import { PricingResolver } from './domain/pricing-resolver.js';
import { BaseTierPercentageStrategy } from './domain/strategies/base-tier-percentage.strategy.js';
import { CostMultiplierStrategy } from './domain/strategies/cost-multiplier.strategy.js';
import { ExplicitPriceStrategy } from './domain/strategies/explicit-price.strategy.js';
import { PriceTierController } from './price-tier.controller.js';
import { PriceTierService } from './price-tier.service.js';
import { PricingContextLoader } from './pricing-context.loader.js';
import { TierPriceGridService } from './tier-price-grid.service.js';

@Module({
  controllers: [PriceTierController],
  providers: [
    ExplicitPriceStrategy,
    CostMultiplierStrategy,
    BaseTierPercentageStrategy,
    PricingResolver,
    PricingContextLoader,
    PriceTierService,
    TierPriceGridService,
  ],
  // The future Menu and Orders modules price items through exactly these.
  exports: [PricingResolver, PricingContextLoader, PriceTierService],
})
export class PricingModule {}
