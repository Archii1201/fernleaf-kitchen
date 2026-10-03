import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../../auth/permissions.js';
import type { PaginatedResponse } from '../../common/pagination/index.js';
import {
  CreateDishDto,
  ListDishQueryDto,
  SetDishActiveDto,
  SetDishOptionGroupsDto,
  UpdateDishDto,
} from './dish.dto.js';
import { DishService } from './dish.service.js';

@ApiTags('catalogue')
@Controller('dishes')
export class DishController {
  constructor(private readonly dishService: DishService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  @ApiOperation({ summary: 'List dishes (paginated, filterable)' })
  list(@Query() query: ListDishQueryDto): Promise<PaginatedResponse<unknown>> {
    return this.dishService.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  @ApiOperation({ summary: 'Create a dish' })
  create(@Body() dto: CreateDishDto): Promise<unknown> {
    return this.dishService.create(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  @ApiOperation({ summary: 'Read one dish' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.dishService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  @ApiOperation({ summary: 'Update a dish' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDishDto,
  ): Promise<unknown> {
    return this.dishService.update(id, dto);
  }

  @Patch(':id/active')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  @ApiOperation({
    summary: 'Activate or deactivate a dish (dishes are never deleted)',
  })
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDishActiveDto,
  ): Promise<unknown> {
    return this.dishService.setActive(id, dto.active);
  }

  @Put(':id/option-groups')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  @ApiOperation({ summary: 'Replace the option groups offered for a dish' })
  setOptionGroups(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDishOptionGroupsDto,
  ): Promise<unknown> {
    return this.dishService.setOptionGroups(id, dto);
  }
}
