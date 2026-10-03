import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../../auth/permissions.js';
import {
  CreateReferenceDto,
  ListReferenceQueryDto,
  UpdateReferenceDto,
} from './reference.dto.js';
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
  allergens(@Query() query: ListReferenceQueryDto): Promise<ReferenceItem[]> {
    return this.referenceData.listAllergens(query);
  }

  @Post('allergens')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  createAllergen(@Body() dto: CreateReferenceDto): Promise<ReferenceItem> {
    return this.referenceData.createAllergen(dto);
  }

  @Patch('allergens/:id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  updateAllergen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReferenceDto,
  ): Promise<ReferenceItem> {
    return this.referenceData.updateAllergen(id, dto);
  }

  @Get('dietary-tags')
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  dietaryTags(@Query() query: ListReferenceQueryDto): Promise<ReferenceItem[]> {
    return this.referenceData.listDietaryTags(query);
  }

  @Post('dietary-tags')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  createDietaryTag(@Body() dto: CreateReferenceDto): Promise<ReferenceItem> {
    return this.referenceData.createDietaryTag(dto);
  }

  @Patch('dietary-tags/:id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  updateDietaryTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReferenceDto,
  ): Promise<ReferenceItem> {
    return this.referenceData.updateDietaryTag(id, dto);
  }

  @Get('kitchen-stations')
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  kitchenStations(
    @Query() query: ListReferenceQueryDto,
  ): Promise<ReferenceItem[]> {
    return this.referenceData.listKitchenStations(query);
  }

  @Post('kitchen-stations')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  createKitchenStation(@Body() dto: CreateReferenceDto): Promise<ReferenceItem> {
    return this.referenceData.createKitchenStation(dto);
  }

  @Patch('kitchen-stations/:id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  updateKitchenStation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReferenceDto,
  ): Promise<ReferenceItem> {
    return this.referenceData.updateKitchenStation(id, dto);
  }

  @Get('portion-sizes')
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  portionSizes(@Query() query: ListReferenceQueryDto): Promise<ReferenceItem[]> {
    return this.referenceData.listPortionSizes(query);
  }

  @Post('portion-sizes')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  createPortionSize(@Body() dto: CreateReferenceDto): Promise<ReferenceItem> {
    return this.referenceData.createPortionSize(dto);
  }

  @Patch('portion-sizes/:id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  updatePortionSize(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReferenceDto,
  ): Promise<ReferenceItem> {
    return this.referenceData.updatePortionSize(id, dto);
  }

  @Get('packaging-types')
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  packagingTypes(
    @Query() query: ListReferenceQueryDto,
  ): Promise<ReferenceItem[]> {
    return this.referenceData.listPackagingTypes(query);
  }

  @Post('packaging-types')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  createPackagingType(@Body() dto: CreateReferenceDto): Promise<ReferenceItem> {
    return this.referenceData.createPackagingType(dto);
  }

  @Patch('packaging-types/:id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  updatePackagingType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReferenceDto,
  ): Promise<ReferenceItem> {
    return this.referenceData.updatePackagingType(id, dto);
  }
}
