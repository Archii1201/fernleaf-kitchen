import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { PaginatedResponse } from '../common/pagination/index.js';
import {
  CreatePriceTierDto,
  PriceTierResponse,
  UpdatePriceTierDto,
} from './dto/price-tier.dto.js';
import {
  BulkSetTierPricesDto,
  BulkSetTierPricesResponse,
  TierPriceGridQueryDto,
  TierPriceGridRow,
} from './dto/tier-price-grid.dto.js';
import { PriceTierService } from './price-tier.service.js';
import { TierPriceGridService } from './tier-price-grid.service.js';

@ApiTags('pricing')
@Controller('price-tiers')
export class PriceTierController {
  constructor(
    private readonly priceTierService: PriceTierService,
    private readonly gridService: TierPriceGridService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRICING_VIEW)
  @ApiOperation({ summary: 'List price tiers with their derivation rules' })
  @ApiOkResponse({ type: [PriceTierResponse] })
  list(): Promise<PriceTierResponse[]> {
    return this.priceTierService.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRICING_MANAGE)
  @ApiOperation({ summary: 'Create a price tier' })
  create(@Body() dto: CreatePriceTierDto): Promise<PriceTierResponse> {
    return this.priceTierService.create(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRICING_VIEW)
  @ApiOperation({ summary: 'Read one price tier' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PriceTierResponse> {
    return this.priceTierService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRICING_MANAGE)
  @ApiOperation({ summary: 'Update a price tier and its derivation rule' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceTierDto,
  ): Promise<PriceTierResponse> {
    return this.priceTierService.update(id, dto);
  }

  @Post(':id/make-default')
  @RequirePermissions(PERMISSIONS.PRICING_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Make this tier the single default tier (transactional)',
  })
  makeDefault(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PriceTierResponse> {
    return this.priceTierService.makeDefault(id);
  }

  @Get(':id/prices')
  @RequirePermissions(PERMISSIONS.PRICING_VIEW)
  @ApiOperation({
    summary: 'Price grid for a tier: cost, derived, override, effective',
  })
  getGrid(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TierPriceGridQueryDto,
  ): Promise<PaginatedResponse<TierPriceGridRow>> {
    return this.gridService.getGrid(id, query);
  }

  @Put(':id/prices')
  @RequirePermissions(PERMISSIONS.PRICING_MANAGE)
  @ApiOperation({
    summary: 'Bulk set overrides; priceCents null clears one back to derived',
  })
  bulkSetPrices(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BulkSetTierPricesDto,
  ): Promise<BulkSetTierPricesResponse> {
    return this.gridService.bulkSetPrices(id, dto);
  }
}
