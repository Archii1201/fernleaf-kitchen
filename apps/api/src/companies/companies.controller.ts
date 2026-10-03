import {
  Body,
  Controller,
  Delete,
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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { PaginatedResponse } from '../common/pagination/index.js';
import { CompaniesService } from './companies.service.js';
import {
  AddCompanyDomainDto,
  CompanyAddressInputDto,
  CreateCompanyDto,
  CreateCompanyHolidayDto,
  ListCompanyQueryDto,
  UpdateCompanyAddressDto,
  UpdateCompanyCalendarDto,
  UpdateCompanyDto,
  UpdateCompanyPriceTierDto,
  UpdateDeliveryDefaultsDto,
  UpdateMenuVisibilityDto,
} from './dto/company.dto.js';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMPANIES_VIEW)
  @ApiOperation({ summary: 'List companies (paginated, searchable)' })
  list(
    @Query() query: ListCompanyQueryDto,
  ): Promise<PaginatedResponse<unknown>> {
    return this.companiesService.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Create a company with domains and addresses' })
  create(@Body() dto: CreateCompanyDto): Promise<unknown> {
    return this.companiesService.create(dto);
  }

  @Get('eligible-drivers')
  @RequirePermissions(PERMISSIONS.COMPANIES_VIEW)
  @ApiOperation({
    summary:
      'Staff who hold delivery.update and may be a company default driver',
  })
  listEligibleDrivers(): Promise<
    { id: string; staffCode: string; fullName: string }[]
  > {
    return this.companiesService.listEligibleDrivers();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COMPANIES_VIEW)
  @ApiOperation({ summary: 'Read one company' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.companiesService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Update company details, billing contact or owner' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ): Promise<unknown> {
    return this.companiesService.update(id, dto);
  }

  // --- Domains -------------------------------------------------------------

  @Get(':id/domains')
  @RequirePermissions(PERMISSIONS.COMPANIES_VIEW)
  @ApiOperation({ summary: 'List the company email domains' })
  listDomains(@Param('id', ParseUUIDPipe) id: string): Promise<unknown[]> {
    return this.companiesService.listDomains(id);
  }

  @Post(':id/domains')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Add an email domain' })
  addDomain(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCompanyDomainDto,
  ): Promise<unknown> {
    return this.companiesService.addDomain(id, dto);
  }

  @Delete(':id/domains/:domainId')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an email domain (never the last one)' })
  removeDomain(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('domainId', ParseUUIDPipe) domainId: string,
  ): Promise<void> {
    return this.companiesService.removeDomain(id, domainId);
  }

  // --- Addresses -----------------------------------------------------------

  @Get(':id/addresses')
  @RequirePermissions(PERMISSIONS.COMPANIES_VIEW)
  @ApiOperation({ summary: 'List delivery addresses' })
  listAddresses(@Param('id', ParseUUIDPipe) id: string): Promise<unknown[]> {
    return this.companiesService.listAddresses(id);
  }

  @Post(':id/addresses')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Add a delivery address' })
  addAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompanyAddressInputDto,
  ): Promise<unknown> {
    return this.companiesService.addAddress(id, dto);
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Update a delivery address' })
  updateAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateCompanyAddressDto,
  ): Promise<unknown> {
    return this.companiesService.updateAddress(id, addressId, dto);
  }

  @Delete(':id/addresses/:addressId')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Retire a delivery address (deactivated, never deleted)',
  })
  deactivateAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ): Promise<void> {
    return this.companiesService.deactivateAddress(id, addressId);
  }

  // --- Calendar ------------------------------------------------------------

  @Get(':id/calendar')
  @RequirePermissions(PERMISSIONS.COMPANIES_VIEW)
  @ApiOperation({
    summary: 'Company receiving calendar (distinct from the kitchen calendar)',
  })
  getCalendar(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.companiesService.getCalendar(id);
  }

  @Put(':id/calendar')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Replace the company working week' })
  replaceCalendar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyCalendarDto,
  ): Promise<unknown> {
    return this.companiesService.replaceCalendar(id, dto);
  }

  @Post(':id/holidays')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Add a company holiday' })
  addHoliday(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCompanyHolidayDto,
  ): Promise<unknown> {
    return this.companiesService.addHoliday(id, dto);
  }

  @Delete(':id/holidays/:holidayId')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a company holiday' })
  removeHoliday(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('holidayId', ParseUUIDPipe) holidayId: string,
  ): Promise<void> {
    return this.companiesService.removeHoliday(id, holidayId);
  }

  // --- Delivery defaults, price tier, menu visibility ----------------------

  @Patch(':id/delivery-defaults')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Update delivery defaults and the default driver' })
  updateDeliveryDefaults(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryDefaultsDto,
  ): Promise<unknown> {
    return this.companiesService.updateDeliveryDefaults(id, dto);
  }

  @Patch(':id/price-tier')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Assign the company price tier' })
  updatePriceTier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyPriceTierDto,
  ): Promise<unknown> {
    return this.companiesService.updatePriceTier(id, dto);
  }

  @Get(':id/menu-visibility')
  @RequirePermissions(PERMISSIONS.COMPANIES_VIEW)
  @ApiOperation({ summary: 'Read hidden categories and dishes' })
  getMenuVisibility(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<unknown> {
    return this.companiesService.getMenuVisibility(id);
  }

  @Put(':id/menu-visibility')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Replace hidden categories and dishes' })
  replaceMenuVisibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuVisibilityDto,
  ): Promise<unknown> {
    return this.companiesService.replaceMenuVisibility(id, dto);
  }
}
