import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import type { PaginatedResponse } from '../common/pagination/index.js';
import {
  AdminAddressDto,
  AdminDeliveryTimeDto,
  AdminPackagingDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  RejectOrderDto,
  ReplaceOrderLinesDto,
  UpdateOrderDto,
} from './dto/order.dto.js';
import { OrderAdminService } from './order-admin.service.js';
import { OrdersService } from './orders.service.js';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly admin: OrderAdminService,
  ) {}

  @Post('quote')
  @RequirePermissions(PERMISSIONS.ORDERS_EDIT)
  @ApiOperation({ summary: 'Validate and price an order without persisting it' })
  quote(@Body() dto: CreateOrderDto) {
    return this.orders.quote(dto);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORDERS_EDIT)
  @ApiOperation({ summary: 'Create a draft order with snapshots and prep units' })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.create(dto, user.id);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  @ApiOperation({ summary: 'List orders (filtered and paginated in PostgreSQL)' })
  list(
    @Query() query: ListOrdersQueryDto,
  ): Promise<PaginatedResponse<unknown>> {
    return this.orders.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getById(id);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.ORDERS_EDIT)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.update(id, dto, user.id);
  }

  @Put(':id/lines')
  @RequirePermissions(PERMISSIONS.ORDERS_EDIT)
  replaceLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceOrderLinesDto,
  ) {
    return this.orders.replaceLines(id, dto);
  }

  @Post(':id/place')
  @RequirePermissions(PERMISSIONS.ORDERS_EDIT)
  place(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.place(id, user.id);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.ORDERS_EDIT)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.cancel(id, user.id);
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.ORDERS_CONFIRM)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.reject(id, dto, user.id);
  }

  @Put(':id/admin/delivery-time')
  @RequirePermissions(PERMISSIONS.ORDERS_OVERRIDE)
  overrideDeliveryTime(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminDeliveryTimeDto,
  ) {
    return this.admin.overrideDeliveryTime(id, dto);
  }

  @Put(':id/admin/address')
  @RequirePermissions(PERMISSIONS.ORDERS_OVERRIDE)
  overrideAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminAddressDto,
  ) {
    return this.admin.overrideAddress(id, dto);
  }

  @Put(':id/admin/packaging')
  @RequirePermissions(PERMISSIONS.ORDERS_OVERRIDE)
  overridePackaging(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminPackagingDto,
  ) {
    return this.admin.overridePackaging(id, dto);
  }
}
