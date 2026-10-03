import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { BillingService } from './billing.service.js';
import {
  CreateCreditDto,
  CreateInvoiceDto,
  ListBillableQueryDto,
  ListInvoicesQueryDto,
} from './dto/billing.dto.js';

@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('billing/orders')
  @RequirePermissions(PERMISSIONS.BILLING_VIEW)
  @ApiOperation({ summary: 'Confirmed, uninvoiced orders grouped by company' })
  listBillable(@Query() query: ListBillableQueryDto) {
    return this.billing.listBillable(query);
  }

  @Get('invoices')
  @RequirePermissions(PERMISSIONS.BILLING_VIEW)
  listInvoices(@Query() query: ListInvoicesQueryDto) {
    return this.billing.listInvoices(query);
  }

  @Get('invoices/:id')
  @RequirePermissions(PERMISSIONS.BILLING_VIEW)
  getInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.billing.getInvoice(id);
  }

  @Post('invoices')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  create(@Body() dto: CreateInvoiceDto) {
    return this.billing.createInvoice(dto);
  }

  @Post('invoices/:id/void')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  voidInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.billing.voidInvoice(id);
  }

  @Post('invoices/:id/paid')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  markPaid(@Param('id', ParseUUIDPipe) id: string) {
    return this.billing.markPaid(id);
  }

  @Post('orders/:id/credits')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  createCredit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCreditDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.createCredit(id, dto, user.id);
  }
}
