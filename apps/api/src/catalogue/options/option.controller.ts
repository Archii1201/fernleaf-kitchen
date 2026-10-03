import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../../auth/permissions.js';
import type { PaginatedResponse } from '../../common/pagination/index.js';
import {
  CreateOptionDto,
  ListOptionQueryDto,
  SetOptionActiveDto,
  UpdateOptionDto,
} from './option.dto.js';
import { OptionService } from './option.service.js';

@ApiTags('catalogue')
@Controller('options')
export class OptionController {
  constructor(private readonly optionService: OptionService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  @ApiOperation({ summary: 'List options (paginated)' })
  list(@Query() query: ListOptionQueryDto): Promise<PaginatedResponse<unknown>> {
    return this.optionService.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  @ApiOperation({ summary: 'Create an option' })
  create(@Body() dto: CreateOptionDto): Promise<unknown> {
    return this.optionService.create(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_VIEW)
  @ApiOperation({ summary: 'Read one option' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.optionService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  @ApiOperation({ summary: 'Update an option' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOptionDto,
  ): Promise<unknown> {
    return this.optionService.update(id, dto);
  }

  @Patch(':id/active')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  @ApiOperation({ summary: 'Activate or deactivate an option' })
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOptionActiveDto,
  ): Promise<unknown> {
    return this.optionService.setActive(id, dto.active);
  }
}
