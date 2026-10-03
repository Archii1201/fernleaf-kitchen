import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('admin')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Admin operational and billing KPIs for today' })
  admin() {
    return this.dashboard.admin();
  }

  @Get('kitchen')
  @RequirePermissions(PERMISSIONS.KITCHEN_VIEW)
  kitchen() {
    return this.dashboard.kitchen();
  }

  @Get('dispatch')
  @RequirePermissions(PERMISSIONS.DISPATCH_VIEW)
  dispatch() {
    return this.dashboard.dispatch();
  }

  @Get('driver')
  @RequirePermissions(PERMISSIONS.DRIVER_VIEW)
  driver(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.driver(user.id);
  }
}
