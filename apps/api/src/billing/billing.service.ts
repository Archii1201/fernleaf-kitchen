import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import {
  paginate,
  type PaginatedResponse,
} from '../common/pagination/index.js';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderNotFoundError } from '../orders/orders.errors.js';
import {
  CreditValidationError,
  InvoiceConflictError,
  InvoiceNotFoundError,
  OrderNotBillableError,
} from './billing.errors.js';
import { applyCredits, creditCapacity } from './domain/invoice-money.js';
import type {
  CreateCreditDto,
  CreateInvoiceDto,
  ListBillableQueryDto,
  ListInvoicesQueryDto,
} from './dto/billing.dto.js';

const BILLABLE_STATUSES = [
  'CONFIRMED',
  'IN_KITCHEN',
  'READY',
  'DISPATCH_READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenTime: KitchenTime,
  ) {}

  async listBillable(query: ListBillableQueryDto): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.OrderWhereInput = {
      status: { in: [...BILLABLE_STATUSES] },
      invoiceId: null,
    };

    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ companyId: 'asc' }, { createdAt: 'asc' }],
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalCents: true,
          deliveryDate: true,
          company: { select: { id: true, name: true } },
        },
      }),
    ]);

    const companies = new Map<
      string,
      {
        company: { id: string; name: string };
        orders: unknown[];
        totalCents: number;
      }
    >();

    for (const row of rows) {
      const bucket = companies.get(row.company.id) ?? {
        company: row.company,
        orders: [],
        totalCents: 0,
      };
      bucket.orders.push({
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        totalCents: row.totalCents,
        deliveryDate: this.kitchenTime.toDateString(row.deliveryDate),
      });
      bucket.totalCents += row.totalCents;
      companies.set(row.company.id, bucket);
    }

    return paginate([...companies.values()], {
      page: query.page,
      limit: query.take,
      total,
    });
  }

  async listInvoices(query: ListInvoicesQueryDto) {
    const [total, rows] = await Promise.all([
      this.prisma.invoice.count(),
      this.prisma.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          company: { select: { id: true, name: true } },
          _count: { select: { lines: true, orders: true } },
        },
      }),
    ]);

    return paginate(rows, { page: query.page, limit: query.take, total });
  }

  async getInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        lines: true,
        orders: {
          select: { id: true, orderNumber: true, totalCents: true, status: true },
        },
      },
    });

    if (!invoice) {
      throw new InvoiceNotFoundError(id);
    }

    return invoice;
  }

  async createInvoice(dto: CreateInvoiceDto) {
    const ids = [...new Set(dto.orderIds)];

    return this.prisma.$transaction(async (tx) => {
      for (const id of ids) {
        await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
      }

      const orders = await tx.order.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          companyId: true,
          status: true,
          invoiceId: true,
          totalCents: true,
          orderNumber: true,
        },
      });

      if (orders.length !== ids.length) {
        const found = new Set(orders.map((row) => row.id));
        throw new OrderNotFoundError(ids.find((id) => !found.has(id))!);
      }

      const companyId = orders[0].companyId;
      for (const order of orders) {
        if (order.companyId !== companyId) {
          throw new CreditValidationError(
            'INVOICE_MIXED_COMPANIES',
            'An invoice can only contain orders from one company.',
          );
        }

        if (order.invoiceId) {
          throw new OrderNotBillableError(
            order.id,
            'That order is already on an invoice.',
          );
        }

        if (!BILLABLE_STATUSES.includes(order.status as (typeof BILLABLE_STATUSES)[number])) {
          throw new OrderNotBillableError(
            order.id,
            'Only confirmed, uninvoiced orders can be billed.',
          );
        }
      }

      const credits = await tx.orderCredit.findMany({
        where: {
          invoiceId: null,
          companyId,
          OR: [{ orderId: { in: ids } }, { orderId: null }],
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, amountCents: true },
      });

      let subtotalCents = 0;
      for (const order of orders) {
        subtotalCents += order.totalCents;
      }

      const money = applyCredits(subtotalCents, credits);
     const invoiceNumber = `INV-${DateTime.fromJSDate(
  this.kitchenTime.now(),
  { zone: 'utc' },
).toFormat('yyyyLLddHHmmssSSS')}-${ids[0].slice(0, 8)}`;

      const invoice = await tx.invoice.create({
        data: {
          companyId,
          invoiceNumber,
          status: 'ISSUED',
          issueDate: this.kitchenTime.fromDateString(this.kitchenTime.today()),
          subtotalCents,
          creditCents: money.creditCents,
          totalCents: money.totalCents,
        },
        select: { id: true },
      });

      for (const order of orders) {
        await tx.order.update({
          where: { id: order.id },
          data: { invoiceId: invoice.id },
        });
        await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            type: 'ORDER',
            orderId: order.id,
            description: `Order ${order.orderNumber}`,
            amountCents: order.totalCents,
          },
        });
      }

      if (money.appliedIds.length > 0) {
        await tx.orderCredit.updateMany({
          where: { id: { in: money.appliedIds } },
          data: { invoiceId: invoice.id },
        });

        const applied = credits.filter((credit) => money.appliedIds.includes(credit.id));
        for (const credit of applied) {
          await tx.invoiceLine.create({
            data: {
              invoiceId: invoice.id,
              type: 'CREDIT',
              orderCreditId: credit.id,
              description: 'Order credit',
              amountCents: -credit.amountCents,
            },
          });
        }
      }

      return tx.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: { lines: true, orders: { select: { id: true, orderNumber: true } } },
      });
    });
  }

  async voidInvoice(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({ where: { id } });

      if (!invoice) {
        throw new InvoiceNotFoundError(id);
      }

      if (invoice.status === 'VOID') {
        throw new InvoiceConflictError(
          'INVOICE_ALREADY_VOID',
          'This invoice is already void.',
          { id },
        );
      }

      if (invoice.status === 'PAID') {
        throw new InvoiceConflictError(
          'INVOICE_PAID_IMMUTABLE',
          'A paid invoice cannot be changed. Issue an order credit instead.',
          { id },
        );
      }

      await tx.invoice.update({ where: { id }, data: { status: 'VOID' } });
      await tx.order.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });
      await tx.orderCredit.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });

      return tx.invoice.findUniqueOrThrow({ where: { id } });
    });
  }

  async markPaid(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({ where: { id } });

      if (!invoice) {
        throw new InvoiceNotFoundError(id);
      }

      if (invoice.status === 'PAID') {
        throw new InvoiceConflictError(
          'INVOICE_ALREADY_PAID',
          'This invoice is already paid.',
          { id },
        );
      }

      if (invoice.status === 'VOID') {
        throw new InvoiceConflictError(
          'INVOICE_VOID',
          'A void invoice cannot be paid.',
          { id },
        );
      }

      return tx.invoice.update({ where: { id }, data: { status: 'PAID' } });
    });
  }

  async createCredit(orderId: string, dto: CreateCreditDto, actorUserId: string) {
    if (dto.amountCents <= 0) {
      throw new CreditValidationError(
        'CREDIT_AMOUNT_INVALID',
        'Credit amountCents must be greater than zero.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId } });

      if (!order) {
        throw new OrderNotFoundError(orderId);
      }

      const existing = await tx.orderCredit.aggregate({
        where: { orderId },
        _sum: { amountCents: true },
      });
      const used = existing._sum.amountCents ?? 0;

      if (dto.amountCents > creditCapacity(order.totalCents, used)) {
        throw new CreditValidationError(
          'CREDIT_EXCEEDS_ORDER',
          'Credits on an order cannot exceed the order total.',
          { orderId, orderTotalCents: order.totalCents, existingCreditCents: used },
        );
      }

      let invoiceId: string | null = dto.invoiceId ?? null;
      if (invoiceId) {
        await tx.$executeRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId}::uuid FOR UPDATE`;
        const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });

        if (!invoice) {
          throw new InvoiceNotFoundError(invoiceId);
        }

        if (invoice.status === 'PAID' || invoice.status === 'VOID') {
          throw new InvoiceConflictError(
            'INVOICE_PAID_IMMUTABLE',
            'Credits cannot be attached to a paid or void invoice.',
            { invoiceId, status: invoice.status },
          );
        }

        if (invoice.companyId !== order.companyId) {
          throw new CreditValidationError(
            'CREDIT_COMPANY_MISMATCH',
            'That invoice belongs to a different company.',
          );
        }
      }

      const credit = await tx.orderCredit.create({
        data: {
          companyId: order.companyId,
          orderId,
          invoiceId,
          amountCents: dto.amountCents,
          reason: dto.reason,
          createdByUserId: actorUserId,
        },
      });

      if (invoiceId) {
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
        const nextCredit = invoice.creditCents + dto.amountCents;
        const nextTotal = invoice.subtotalCents - nextCredit;
        if (nextTotal < 0) {
          throw new CreditValidationError(
            'INVOICE_TOTAL_NEGATIVE',
            'Applying that credit would make the invoice total negative.',
          );
        }

        await tx.invoiceLine.create({
          data: {
            invoiceId,
            type: 'CREDIT',
            orderCreditId: credit.id,
            description: dto.reason,
            amountCents: -dto.amountCents,
          },
        });
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { creditCents: nextCredit, totalCents: nextTotal },
        });
      }

      return credit;
    });
  }
}
