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
  CreateOptionGroupDto,
  ListOptionGroupQueryDto,
  SetOptionGroupOptionsDto,
  UpdateOptionGroupDto,
} from './option-group.dto.js';
import { OptionGroupService } from './option-group.service.js';

@ApiTags('catalogue')
@Controller('option-groups')
export class OptionGroupController {
  constructor(private readonly optionGroupService: OptionGroupService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  @ApiOperation({ summary: 'List option groups with their options' })
  list(
    @Query() query: ListOptionGroupQueryDto,
  ): Promise<PaginatedResponse<unknown>> {
    return this.optionGroupService.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  @ApiOperation({ summary: 'Create an option group' })
  create(@Body() dto: CreateOptionGroupDto): Promise<unknown> {
    return this.optionGroupService.create(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  @ApiOperation({ summary: 'Read one option group' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.optionGroupService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  @ApiOperation({ summary: 'Update an option group' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOptionGroupDto,
  ): Promise<unknown> {
    return this.optionGroupService.update(id, dto);
  }

  @Put(':id/options')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  @ApiOperation({ summary: 'Replace the options in a group' })
  setOptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOptionGroupOptionsDto,
  ): Promise<unknown> {
    return this.optionGroupService.setOptions(id, dto);
  }
}
