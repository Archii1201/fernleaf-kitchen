import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { DispatchService } from './dispatch.service.js';
import { AssignDriverDto } from './dto/dispatch.dto.js';

@ApiTags('dispatch')
@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('drops')
  @RequirePermissions(PERMISSIONS.DISPATCH_VIEW)
  @ApiOperation({ summary: 'Drops for a delivery date (defaults to today)' })
  list(@Query('date') date?: string) {
    return this.dispatch.list(date);
  }

  @Post('drops/:id/assign-driver')
  @RequirePermissions(PERMISSIONS.DISPATCH_MANAGE)
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDriverDto,
  ) {
    return this.dispatch.assignDriver(id, dto.driverStaffId);
  }

  @Post('orders/:id/ready')
  @RequirePermissions(PERMISSIONS.DISPATCH_MANAGE)
  ready(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispatch.markOrderReady(id, user.id);
  }

  @Post('drops/:id/out')
  @RequirePermissions(PERMISSIONS.DISPATCH_MANAGE)
  out(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispatch.markOut(id, user.id);
  }

  @Post('drops/:id/deliver')
  @RequirePermissions(PERMISSIONS.DISPATCH_MANAGE)
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispatch.deliver(id, user.id);
  }
}
