import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  paginate,
  type PaginatedResponse,
} from '../common/pagination/index.js';
import { plannedKitchenTimes } from '../kitchen/board/kitchen-timing.js';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import type {
  CreateOrderDto,
  ListOrdersQueryDto,
  RejectOrderDto,
  ReplaceOrderLinesDto,
  UpdateOrderDto,
} from './dto/order.dto.js';
import { CutoffPolicy } from './domain/cutoff-policy.js';
import { diffCombinations } from './domain/line-diff.js';
import { OrderBuilder, toQuoteResponse } from './domain/order-builder.js';
import {
  allowsLineDiff,
  assertTransition,
  isEditableStatus,
  type OrderStatus,
} from './domain/order-state.js';
import { OrderRepository } from './order.repository.js';
import {
  OrderNotEditableError,
  OrderInvoicedError,
  OrderNotFoundError,
  OrderVersionConflictError,
  PrepUnitLockedError,
} from './orders.errors.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly builder: OrderBuilder,
    private readonly repository: OrderRepository,
    private readonly cutoff: CutoffPolicy,
    private readonly kitchenTime: KitchenTime,
  ) {}

  async quote(dto: CreateOrderDto) {
    const result = await this.builder.build(dto, { enforceCutoff: false });

    return toQuoteResponse(result);
  }

  async create(dto: CreateOrderDto, actorUserId: string) {
    const { order } = await this.builder.build(dto, { enforceCutoff: true });
    const id = await this.repository.create(order, actorUserId);

    return this.toResponse(await this.repository.findById(id));
  }

  async list(query: ListOrdersQueryDto): Promise<PaginatedResponse<unknown>> {
    const where = this.listWhere(query);
    const [total, rows] = await Promise.all([
      this.repository.count(where),
      this.repository.listWhere({
        where,
        orderBy: [{ deliveryDate: 'asc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          deliveryDate: true,
          deliveryTime: true,
          subtotalCents: true,
          totalCents: true,
          version: true,
          invoiceId: true,
          company: { select: { id: true, name: true } },
          customerEmployee: {
            select: { id: true, fullName: true, email: true },
          },
          createdAt: true,
        },
      }),
    ]);

    return paginate(
      rows.map((row) => this.toListItem(row)),
      { page: query.page, limit: query.take, total },
    );
  }

  async getById(id: string) {
    return this.toResponse(await this.repository.findById(id));
  }

  async update(id: string, dto: UpdateOrderDto, actorUserId: string) {
    const header = await this.repository.findHeader(id);

    if (header.invoiceId) throw new OrderInvoicedError(header.invoiceId);

    if (!isEditableStatus(header.status as OrderStatus)) {
      throw new OrderNotEditableError(header.status);
    }

    if (dto.version !== undefined && dto.version !== header.version) {
      throw new OrderVersionConflictError(dto.version, header.version);
    }

    await this.cutoff.assertBeforeCutoff(
      this.kitchenTime.toDateString(header.deliveryDate),
    );

    const detail = await this.repository.findById(id);
    const locked = detail.prepUnits.some(
      (unit) => unit.status !== 'PENDING',
    );

    if (locked) {
      throw new PrepUnitLockedError('order', 'IN_PROGRESS');
    }

    const { order } = await this.builder.build(dto, { enforceCutoff: true });
    await this.repository.replaceAllLines(id, order.lines, dto.version ?? header.version, {
      deliveryDate: this.kitchenTime.fromDateString(order.delivery.deliveryDate),
      deliveryTime: this.kitchenTime.fromTimeString(order.delivery.deliveryTime),
     deliveryAddress: {
  connect: {
    id: order.delivery.deliveryAddressId,
  },
},
      deliveryAddressLabel: order.delivery.deliveryAddressLabel,
      deliveryAddressLine1: order.delivery.deliveryAddressLine1,
      deliveryAddressLine2: order.delivery.deliveryAddressLine2,
      deliveryAddressCity: order.delivery.deliveryAddressCity,
      deliveryAddressState: order.delivery.deliveryAddressState,
      deliveryAddressPostalCode: order.delivery.deliveryAddressPostalCode,
      deliveryAddressCountry: order.delivery.deliveryAddressCountry,
 ...(order.delivery.packagingTypeId
  ? {
      packagingType: {
        connect: {
          id: order.delivery.packagingTypeId,
        },
      },
    }
  : {}),
packagingTypeName: order.delivery.packagingTypeName,
      customerNotes: order.customerNotes,
      leaveKitchenMinutes: order.delivery.leaveKitchenMinutes,
      ...plannedKitchenTimes(
        this.kitchenTime.combineDateAndTime(
          order.delivery.deliveryDate,
          order.delivery.deliveryTime,
        ),
        order.delivery.leaveKitchenMinutes,
      ),
      priceTier: {
  connect: {
    id: order.priceTierId,
  },
},
      priceTierName: order.priceTierName,
      subtotalCents: order.subtotalCents,
      totalCents: order.totalCents,
    });
    void actorUserId;

    return this.toResponse(await this.repository.findById(id));
  }

  async replaceLines(id: string, dto: ReplaceOrderLinesDto) {
    const header = await this.repository.findHeader(id);

    if (header.invoiceId) throw new OrderInvoicedError(header.invoiceId);

    if (!allowsLineDiff(header.status as OrderStatus)) {
      throw new OrderNotEditableError(header.status);
    }

    const built = await this.builder.build(
      {
        customerEmployeeId: header.customerEmployeeId,
        deliveryDate: this.kitchenTime.toDateString(header.deliveryDate),
        customerNotes: header.customerNotes ?? undefined,
        lines: dto.lines,
      },
      { enforceCutoff: false },
    );

    const detail = await this.repository.findById(id);
    const existing = this.repository.existingCombinations(detail);
    const diffs = diffCombinations(built.order.lines, existing);

    await this.repository.applyLineDiff({
      orderId: id,
      expectedVersion: dto.version,
      incoming: built.order,
      existing,
      diffs,
    });

    return this.toResponse(await this.repository.findById(id));
  }

  async place(id: string, actorUserId: string) {
    const header = await this.repository.findHeader(id);
    assertTransition(header.status as OrderStatus, 'PLACED');
    await this.cutoff.assertBeforeCutoff(
      this.kitchenTime.toDateString(header.deliveryDate),
    );

    await this.repository.transition(id, header.version, 'PLACED', {
      placedAt: this.kitchenTime.now(),
    }, {
      order: { connect: { id } },
      type: 'PLACED',
      actorType: 'STAFF',
      actorUser: { connect: { id: actorUserId } },
    });

    return this.toResponse(await this.repository.findById(id));
  }

  async cancel(id: string, actorUserId: string) {
    const header = await this.repository.findHeader(id);
    assertTransition(header.status as OrderStatus, 'CANCELLED');

    await this.repository.transition(id, header.version, 'CANCELLED', {
      cancelledAt: this.kitchenTime.now(),
    }, {
      order: { connect: { id } },
      type: 'CANCELLED',
      actorType: 'STAFF',
      actorUser: { connect: { id: actorUserId } },
    });

    return this.toResponse(await this.repository.findById(id));
  }

  async reject(id: string, dto: RejectOrderDto, actorUserId: string) {
    const header = await this.repository.findHeader(id);
    assertTransition(header.status as OrderStatus, 'REJECTED');

    await this.repository.transition(id, header.version, 'REJECTED', {
      rejectedAt: this.kitchenTime.now(),
      rejectionReason: dto.reason ?? null,
    }, {
      order: { connect: { id } },
      type: 'REJECTED',
      actorType: 'STAFF',
      actorUser: { connect: { id: actorUserId } },
      note: dto.reason ?? null,
    });

    return this.toResponse(await this.repository.findById(id));
  }

  private listWhere(query: ListOrdersQueryDto): Prisma.OrderWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.invoiced === undefined
        ? {}
        : { invoiceId: query.invoiced ? { not: null } : null }),
      ...(query.deliveryDateFrom || query.deliveryDateTo
        ? {
            deliveryDate: {
              ...(query.deliveryDateFrom
                ? {
                    gte: this.kitchenTime.fromDateString(query.deliveryDateFrom),
                  }
                : {}),
              ...(query.deliveryDateTo
                ? { lte: this.kitchenTime.fromDateString(query.deliveryDateTo) }
                : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                orderNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                company: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                customerEmployee: {
                  fullName: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
  }

  private toListItem(row: {
    id: string;
    orderNumber: string;
    status: string;
    deliveryDate: Date;
    deliveryTime: Date;
    subtotalCents: number;
    totalCents: number;
    version: number;
    invoiceId: string | null;
    company: { id: string; name: string };
    customerEmployee: { id: string; fullName: string; email: string };
    createdAt: Date;
  }) {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      deliveryDate: this.kitchenTime.toDateString(row.deliveryDate),
      deliveryTime: this.kitchenTime.toTimeString(row.deliveryTime),
      subtotalCents: row.subtotalCents,
      totalCents: row.totalCents,
      version: row.version,
      invoiced: row.invoiceId !== null,
      company: row.company,
      employee: row.customerEmployee,
      createdAt: row.createdAt,
    };
  }

  private toResponse(order: Awaited<ReturnType<OrderRepository['findById']>>) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      version: order.version,
      company: order.company,
      employee: order.customerEmployee,
      delivery: {
        date: this.kitchenTime.toDateString(order.deliveryDate),
        time: this.kitchenTime.toTimeString(order.deliveryTime),
        address: {
          id: order.deliveryAddressId,
          label: order.deliveryAddressLabel,
          line1: order.deliveryAddressLine1,
          line2: order.deliveryAddressLine2,
          city: order.deliveryAddressCity,
          state: order.deliveryAddressState,
          postalCode: order.deliveryAddressPostalCode,
          country: order.deliveryAddressCountry,
        },
        packagingTypeName: order.packagingTypeName,
        leaveKitchenMinutes: order.leaveKitchenMinutes,
      },
      priceTier: { id: order.priceTierId, name: order.priceTierName },
      customerNotes: order.customerNotes,
      lines: order.lines.map((line) => ({
        id: line.id,
        dishId: line.dishId,
        notes: line.notes,
        sku: line.dishSku,
        name: line.dishName,
        description: line.dishDescription,
        temperature: line.dishTemperature,
        kitchenStation: {
          id: line.kitchenStationId,
          code: line.kitchenStationCode,
          name: line.kitchenStationName,
        },
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        lineTotalCents: line.lineTotalCents,
        combinations: line.combinations.map((combination) => ({
          id: combination.id,
          quantity: combination.quantity,
          signature: combination.signature,
          unitPriceCents: combination.unitPriceCents,
          optionsPriceCents: combination.optionsPriceCents,
          totalCents: combination.totalCents,
          options: combination.options.map((option) => ({
            optionId: option.optionId,
            optionGroupId: option.optionGroupId,
            optionGroupName: option.optionGroupName,
            optionName: option.optionName,
            optionPriceCents: option.optionPriceCents,
          })),
          prepUnit: combination.prepUnit,
        })),
      })),
      prepUnits: order.prepUnits.map((unit) => ({
        id: unit.id,
        dishName: unit.dishName,
        quantity: unit.quantity,
        status: unit.status,
        kitchenStationCode: unit.kitchenStationCode,
      })),
      events: order.events.map((event) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt,
        note: event.note,
      })),
      invoice: order.invoice,
      subtotalCents: order.subtotalCents,
      totalCents: order.totalCents,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}

export { OrderNotFoundError };
