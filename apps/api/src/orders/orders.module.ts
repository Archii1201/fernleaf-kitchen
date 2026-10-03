import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module.js';
import { MenuModule } from '../menu/menu.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { CutoffPolicy } from './domain/cutoff-policy.js';
import { DeliveryResolver } from './domain/delivery-resolver.js';
import { OrderBuilder } from './domain/order-builder.js';
import { OrderPricer } from './domain/order-pricer.js';
import { OrderRepository } from './order.repository.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [MenuModule, CatalogueModule, PricingModule],
  controllers: [OrdersController],
  providers: [
    DeliveryResolver,
    OrderPricer,
    CutoffPolicy,
    OrderBuilder,
    OrderRepository,
    OrdersService,
  ],
  exports: [OrdersService, OrderBuilder, CutoffPolicy],
})
export class OrdersModule {}
