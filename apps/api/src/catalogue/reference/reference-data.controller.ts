import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../../auth/permissions.js';
import {
  ReferenceDataService,
  type ReferenceItem,
} from './reference-data.service.js';

@ApiTags('catalogue')
@Controller('reference')
export class ReferenceDataController {
  constructor(private readonly referenceData: ReferenceDataService) {}

  @Get('allergens')
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  @ApiOperation({ summary: 'List allergens' })
  allergens(): Promise<ReferenceItem[]> {
    return this.referenceData.listAllergens();
  }

  @Get('dietary-tags')
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  @ApiOperation({ summary: 'List dietary tags' })
  dietaryTags(): Promise<ReferenceItem[]> {
    return this.referenceData.listDietaryTags();
  }

  @Get('kitchen-stations')
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  @ApiOperation({ summary: 'List kitchen stations' })
  kitchenStations(): Promise<ReferenceItem[]> {
    return this.referenceData.listKitchenStations();
  }

  @Get('portion-sizes')
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  @ApiOperation({ summary: 'List portion sizes' })
  portionSizes(): Promise<ReferenceItem[]> {
    return this.referenceData.listPortionSizes();
  }

  @Get('packaging-types')
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  @ApiOperation({ summary: 'List packaging types' })
  packagingTypes(): Promise<ReferenceItem[]> {
    return this.referenceData.listPackagingTypes();
  }
}
