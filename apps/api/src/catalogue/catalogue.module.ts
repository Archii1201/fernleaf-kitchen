import { Module } from '@nestjs/common';
import { CombinationValidator } from './combinations/combination-validator.js';
import { DishController } from './dishes/dish.controller.js';
import { DishService } from './dishes/dish.service.js';
import { OptionGroupController } from './option-groups/option-group.controller.js';
import { OptionGroupService } from './option-groups/option-group.service.js';
import { OptionController } from './options/option.controller.js';
import { OptionService } from './options/option.service.js';
import { ReferenceDataController } from './reference/reference-data.controller.js';
import { ReferenceDataService } from './reference/reference-data.service.js';

@Module({
  controllers: [
    DishController,
    OptionController,
    OptionGroupController,
    ReferenceDataController,
  ],
  providers: [
    DishService,
    OptionService,
    OptionGroupService,
    ReferenceDataService,
    CombinationValidator,
  ],
  // Orders (a later step) will reuse the validator and the dish loader.
  exports: [CombinationValidator, DishService],
})
export class CatalogueModule {}
