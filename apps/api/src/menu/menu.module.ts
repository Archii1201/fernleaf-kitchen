import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module.js';
import { MenuContextLoader } from './menu-context.loader.js';
import { MenuController } from './menu.controller.js';
import { MenuResolver } from './menu.resolver.js';
import { MenuService } from './menu.service.js';

/**
 * Menu resolution. Orders (a later step) must import this module and call
 * `MenuService.assertOrderable` / `MenuResolver.assertDishOrderable` instead
 * of re-implementing active/hidden/pricing checks.
 */
@Module({
  imports: [PricingModule],
  controllers: [MenuController],
  providers: [MenuContextLoader, MenuResolver, MenuService],
  exports: [MenuResolver, MenuService, MenuContextLoader],
})
export class MenuModule {}
