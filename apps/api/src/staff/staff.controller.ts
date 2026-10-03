import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import {
  PaginationQueryDto,
  type PaginatedResponse,
} from '../common/pagination/index.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { StaffResponse } from './dto/staff.response.js';
import { UpdateStaffActiveDto } from './dto/update-staff-active.dto.js';
import { UpdateStaffRoleDto } from './dto/update-staff-role.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { StaffService } from './staff.service.js';

@ApiTags('staff')
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STAFF_VIEW)
  @ApiOperation({ summary: 'List staff accounts (paginated)' })
  list(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponse<StaffResponse>> {
    return this.staffService.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.STAFF_MANAGE)
  @ApiOperation({ summary: 'Create a staff account' })
  @ApiConflictResponse({ description: 'Email or staff code already in use.' })
  create(@Body() dto: CreateStaffDto): Promise<StaffResponse> {
    return this.staffService.create(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.STAFF_VIEW)
  @ApiOperation({ summary: 'Read one staff account' })
  @ApiOkResponse({ type: StaffResponse })
  @ApiNotFoundResponse({ description: 'Staff member not found.' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffResponse> {
    return this.staffService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.STAFF_MANAGE)
  @ApiOperation({ summary: 'Update profile fields of a staff account' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ): Promise<StaffResponse> {
    return this.staffService.updateProfile(id, dto);
  }

  @Patch(':id/role')
  @RequirePermissions(PERMISSIONS.STAFF_MANAGE)
  @ApiOperation({ summary: "Change a staff account's role" })
  @ApiForbiddenResponse({
    description: 'An admin cannot drop their own staff-management capability.',
  })
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffRoleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<StaffResponse> {
    return this.staffService.updateRole(id, dto.roleId, currentUser);
  }

  @Patch(':id/active')
  @RequirePermissions(PERMISSIONS.STAFF_MANAGE)
  @ApiOperation({ summary: 'Activate or deactivate a staff account' })
  @ApiForbiddenResponse({
    description: 'An admin cannot deactivate their own account.',
  })
  updateActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffActiveDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<StaffResponse> {
    return this.staffService.updateActive(id, dto.active, currentUser);
  }
}
