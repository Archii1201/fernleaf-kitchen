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
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { PaginatedResponse } from '../common/pagination/index.js';
import {
  CreateEmployeeDto,
  ListEmployeeQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto.js';
import { EmployeesService } from './employees.service.js';

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EMPLOYEES_VIEW)
  @ApiOperation({
    summary: 'List customer employees (filter by company, paginated)',
  })
  list(
    @Query() query: ListEmployeeQueryDto,
  ): Promise<PaginatedResponse<unknown>> {
    return this.employeesService.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  @ApiOperation({ summary: 'Create an employee inside one company' })
  create(@Body() dto: CreateEmployeeDto): Promise<unknown> {
    return this.employeesService.create(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_VIEW)
  @ApiOperation({ summary: 'Read one employee' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.employeesService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  @ApiOperation({
    summary:
      'Update an employee, including moving them to another company. Historical orders are never rewritten.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<unknown> {
    return this.employeesService.update(id, dto);
  }
}
