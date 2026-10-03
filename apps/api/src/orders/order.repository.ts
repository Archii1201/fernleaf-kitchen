import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { combinationKey } from './domain/line-diff.js';
import type { OrderStatus } from './domain/order-state.js';
import type {
  BuiltLine,
  BuiltOrder,
  ExistingCombinationView,
} from './domain/order-types.js';
import { OrderNotFoundError, OrderVersionConflictError } from './orders.errors.js';

export const ORDER_DETAIL_INCLUDE = {
  company: { select: { id: true, name: true } },
  customerEmployee: {
    select: { id: true, fullName: true, email: true },
  },
  invoice: { select: { id: true, invoiceNumber: true, status: true } },
  lines: {
    orderBy: { displayOrder: 'asc' as const },
    include: {
      combinations: {
        include: {
          options: true,
          prepUnit: {
            select: { id: true, status: true, quantity: true, dishName: true },
          },
        },
      },
    },
  },
  events: { orderBy: { occurredAt: 'asc' as const } },
  prepUnits: true,
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrderRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenTime: KitchenTime,
  ) {}

  async create(
    built: BuiltOrder,
    actorUserId: string | null,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.nextOrderNumber(
        tx,
        built.delivery.deliveryDate,
      );

      const order = await tx.order.create({
        data: {
          orderNumber,
          companyId: built.delivery.companyId,
          customerEmployeeId: built.delivery.customerEmployeeId,
          status: 'DRAFT',
          deliveryDate: this.kitchenTime.fromDateString(
            built.delivery.deliveryDate,
          ),
          deliveryTime: this.kitchenTime.fromTimeString(
            built.delivery.deliveryTime,
          ),
          deliveryAddressId: built.delivery.deliveryAddressId,
          deliveryAddressLabel: built.delivery.deliveryAddressLabel,
          deliveryAddressLine1: built.delivery.deliveryAddressLine1,
          deliveryAddressLine2: built.delivery.deliveryAddressLine2,
          deliveryAddressCity: built.delivery.deliveryAddressCity,
          deliveryAddressState: built.delivery.deliveryAddressState,
          deliveryAddressPostalCode: built.delivery.deliveryAddressPostalCode,
          deliveryAddressCountry: built.delivery.deliveryAddressCountry,
          packagingTypeId: built.delivery.packagingTypeId,
          packagingTypeName: built.delivery.packagingTypeName,
          priceTierId: built.priceTierId,
          priceTierName: built.priceTierName,
          leaveKitchenMinutes: built.delivery.leaveKitchenMinutes,
          driverStaffId: built.delivery.defaultDriverStaffId,
          customerNotes: built.customerNotes,
          subtotalCents: built.subtotalCents,
          totalCents: built.totalCents,
        },
        select: { id: true },
      });

      await this.writeLines(tx, order.id, built.lines);
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'DRAFT',
          actorType: actorUserId ? 'STAFF' : 'SYSTEM',
          actorUserId,
        },
      });

      return order.id;
    });
  }

  async replaceAllLines(orderId: string, lines: BuiltLine[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.orderLine.deleteMany({ where: { orderId } });
      await this.writeLines(tx, orderId, lines);
      const totals = sumLines(lines);
      await tx.order.update({
        where: { id: orderId },
        data: {
          ...totals,
          version: { increment: 1 },
        },
      });
    });
  }

  async lockAndLoad(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
  SELECT id
  FROM "Order"
  WHERE id = ${id}
  FOR UPDATE
`;

      const order = await tx.order.findUnique({
        where: { id },
        include: {
          lines: {
            include: {
              combinations: { include: { prepUnit: true } },
            },
          },
        },
      });

      if (!order) {
        throw new OrderNotFoundError(id);
      }

      return { tx, order };
    });
  }

  existingCombinations(order: {
    lines: {
      id: string;
      dishId: string | null;
      combinations: {
        id: string;
        signature: string;
        quantity: number;
        prepUnit: { status: string } | null;
      }[];
    }[];
  }): ExistingCombinationView[] {
    const rows: ExistingCombinationView[] = [];

    for (const line of order.lines) {
      if (!line.dishId) {
        continue;
      }

      for (const combination of line.combinations) {
        rows.push({
          key: combinationKey(line.dishId, combination.signature),
          dishId: line.dishId,
          signature: combination.signature,
          quantity: combination.quantity,
          combinationId: combination.id,
          lineId: line.id,
          prepStatus:
            (combination.prepUnit?.status as ExistingCombinationView['prepStatus']) ??
            'PENDING',
        });
      }
    }

    return rows;
  }

  async applyLineDiff(input: {
    orderId: string;
    expectedVersion: number;
    incoming: BuiltOrder;
    existing: ExistingCombinationView[];
    diffs: import('./domain/order-types.js').LineDiffEntry[];
  }): Promise<void> {
    const { orderId, incoming, diffs } = input;
    const linesByDish = new Map(incoming.lines.map((line) => [line.dishId, line]));

    await this.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
  SELECT id
  FROM "Order"
  WHERE id = ${orderId}
  FOR UPDATE
`;
      const current = await tx.order.findUnique({
        where: { id: orderId },
        select: { version: true },
      });

      if (!current) {
        throw new OrderNotFoundError(orderId);
      }

      if (current.version !== input.expectedVersion) {
        throw new OrderVersionConflictError(input.expectedVersion, current.version);
      }

      const lineIdsByDish = new Map<string, string>();
      const existingLines = await tx.orderLine.findMany({
        where: { orderId },
        select: { id: true, dishId: true },
      });

      for (const line of existingLines) {
        if (line.dishId) {
          lineIdsByDish.set(line.dishId, line.id);
        }
      }

      for (const diff of diffs) {
        if (diff.kind === 'UNCHANGED') {
          continue;
        }

        if (diff.kind === 'NEW' && diff.incoming) {
          const builtLine = linesByDish.get(diff.incoming.dishId)!;
          let lineId = lineIdsByDish.get(diff.incoming.dishId);

          if (!lineId) {
            const created = await tx.orderLine.create({
              data: this.lineData(orderId, builtLine, lineIdsByDish.size),
              select: { id: true },
            });
            lineId = created.id;
            lineIdsByDish.set(diff.incoming.dishId, lineId);
          }

          const combo = await tx.orderCombination.create({
            data: {
              orderLineId: lineId,
              quantity: diff.incoming.quantity,
              unitPriceCents: diff.incoming.unitPriceCents,
              optionsPriceCents: diff.incoming.optionsPriceCents,
              totalCents: diff.incoming.totalCents,
              signature: diff.incoming.signature,
              options: {
                create: diff.incoming.options.map((option) => ({
                  optionId: option.optionId,
                  optionGroupId: option.optionGroupId,
                  optionGroupName: option.optionGroupName,
                  optionName: option.optionName,
                  optionPriceCents: option.optionPriceCents,
                })),
              },
            },
            select: { id: true },
          });

          await tx.prepUnit.create({
            data: {
              orderId,
              orderCombinationId: combo.id,
              kitchenStationId: builtLine.kitchenStationId,
              kitchenStationCode: builtLine.kitchenStationCode,
              kitchenStationName: builtLine.kitchenStationName,
              dishName: builtLine.dishName,
              quantity: diff.incoming.quantity,
              status: 'PENDING',
            },
          });
        }

        if (diff.kind === 'CHANGED' && diff.existing && diff.incoming) {
          await tx.orderCombination.update({
            where: { id: diff.existing.combinationId },
            data: {
              quantity: diff.incoming.quantity,
              unitPriceCents: diff.incoming.unitPriceCents,
              optionsPriceCents: diff.incoming.optionsPriceCents,
              totalCents: diff.incoming.totalCents,
            },
          });
          await tx.prepUnit.update({
            where: { orderCombinationId: diff.existing.combinationId },
            data: { quantity: diff.incoming.quantity },
          });
        }

        if (diff.kind === 'REMOVED' && diff.existing) {
          await tx.prepUnit.deleteMany({
            where: { orderCombinationId: diff.existing.combinationId },
          });
          await tx.orderCombination.delete({
            where: { id: diff.existing.combinationId },
          });
        }
      }

      await this.recalculate(tx, orderId, incoming);
      await tx.order.update({
        where: { id: orderId },
        data: { version: { increment: 1 } },
      });
    });
  }

  async findById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: ORDER_DETAIL_INCLUDE,
    });

    if (!order) {
      throw new OrderNotFoundError(id);
    }

    return order;
  }

  async findHeader(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order) {
      throw new OrderNotFoundError(id);
    }

    return order;
  }

  updateStatus(
    id: string,
    data: Prisma.OrderUpdateInput,
  ): Promise<unknown> {
    return this.prisma.order.update({ where: { id }, data });
  }

  addEvent(data: Prisma.OrderEventCreateInput) {
    return this.prisma.orderEvent.create({ data });
  }

async listWhere<T extends Prisma.OrderFindManyArgs>(
  args: Prisma.SelectSubset<T, Prisma.OrderFindManyArgs>,
) {
  return this.prisma.order.findMany(args);
}

  count(where: Prisma.OrderWhereInput) {
    return this.prisma.order.count({ where });
  }

  private async writeLines(
    tx: Prisma.TransactionClient,
    orderId: string,
    lines: BuiltLine[],
  ): Promise<void> {
    for (const [index, line] of lines.entries()) {
      const createdLine = await tx.orderLine.create({
        data: this.lineData(orderId, line, index),
        select: { id: true },
      });

      for (const combination of line.combinations) {
        const createdCombo = await tx.orderCombination.create({
          data: {
            orderLineId: createdLine.id,
            quantity: combination.quantity,
            unitPriceCents: combination.unitPriceCents,
            optionsPriceCents: combination.optionsPriceCents,
            totalCents: combination.totalCents,
            signature: combination.signature,
            options: {
              create: combination.options.map((option) => ({
                optionId: option.optionId,
                optionGroupId: option.optionGroupId,
                optionGroupName: option.optionGroupName,
                optionName: option.optionName,
                optionPriceCents: option.optionPriceCents,
              })),
            },
          },
          select: { id: true },
        });

        await tx.prepUnit.create({
          data: {
            orderId,
            orderCombinationId: createdCombo.id,
            kitchenStationId: line.kitchenStationId,
            kitchenStationCode: line.kitchenStationCode,
            kitchenStationName: line.kitchenStationName,
            dishName: line.dishName,
            quantity: combination.quantity,
            status: 'PENDING',
          },
        });
      }
    }
  }

  private lineData(orderId: string, line: BuiltLine, displayOrder: number) {
    return {
      orderId,
      dishId: line.dishId,
      dishName: line.dishName,
      dishSku: line.dishSku,
      dishDescription: line.dishDescription,
      dishTemperature: line.dishTemperature,
      kitchenStationId: line.kitchenStationId,
      kitchenStationCode: line.kitchenStationCode,
      kitchenStationName: line.kitchenStationName,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
      displayOrder,
      notes: line.notes,
    };
  }

  private async recalculate(
    tx: Prisma.TransactionClient,
    orderId: string,
    incoming: BuiltOrder,
  ): Promise<void> {
    for (const line of incoming.lines) {
      await tx.orderLine.updateMany({
        where: { orderId, dishId: line.dishId },
        data: {
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          lineTotalCents: line.lineTotalCents,
        },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotalCents: incoming.subtotalCents,
        totalCents: incoming.totalCents,
      },
    });
  }

  private async nextOrderNumber(
    tx: Prisma.TransactionClient,
    deliveryDate: string,
  ): Promise<string> {
    const prefix = `FK-${deliveryDate.replaceAll('-', '')}-`;
    const last = await tx.order.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const next = last
      ? Number(last.orderNumber.slice(prefix.length)) + 1
      : 1;

    return `${prefix}${String(next).padStart(4, '0')}`;
  }
}

function sumLines(lines: BuiltLine[]) {
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

  return { subtotalCents, totalCents: subtotalCents };
}

export type { OrderStatus };
