import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../../auth/permissions.js';
import {
  PaginationQueryDto,
  type PaginatedResponse,
} from '../../common/pagination/index.js';
import { CutoffService, type ResolvedCutoff } from '../cutoff/cutoff.service.js';
import {
  CreateHolidayDto,
  HolidayResponse,
  SettingsResponse,
  UpdateSettingsDto,
} from './dto/settings.dto.js';
import { SettingsService } from './settings.service.js';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly cutoffService: CutoffService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({ summary: 'Read the kitchen cutoff configuration' })
  @ApiOkResponse({ type: SettingsResponse })
  get(): Promise<SettingsResponse> {
    return this.settingsService.get();
  }

  @Put()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Replace the cutoff configuration and working week' })
  @ApiOkResponse({ type: SettingsResponse })
  update(@Body() dto: UpdateSettingsDto): Promise<SettingsResponse> {
    return this.settingsService.update(dto);
  }

  @Get('cutoff-preview')
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({
    summary: 'Cutoff instant for a delivery date, using the current settings',
  })
  @ApiQuery({ name: 'deliveryDate', example: '2026-10-07' })
  preview(
    @Query('deliveryDate') deliveryDate: string,
  ): Promise<ResolvedCutoff> {
    return this.cutoffService.resolve(deliveryDate);
  }

  @Get('holidays')
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({ summary: 'List kitchen holidays' })
  listHolidays(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponse<HolidayResponse>> {
    return this.settingsService.listHolidays(query);
  }

  @Post('holidays')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Add a kitchen holiday' })
  addHoliday(@Body() dto: CreateHolidayDto): Promise<HolidayResponse> {
    return this.settingsService.addHoliday(dto);
  }

  @Delete('holidays/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a kitchen holiday' })
  removeHoliday(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.settingsService.removeHoliday(id);
  }
}
