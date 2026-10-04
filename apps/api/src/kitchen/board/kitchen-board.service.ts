import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { KitchenTime } from '../time/kitchen-time.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  KitchenOrderNotWorkableError,
  PrepUnitConflictError,
  PrepUnitNotFoundError,
} from '../kitchen.errors.js';
import {
  kitchenTimingState,
  plannedKitchenTimes,
  type KitchenTimingState,
} from './kitchen-timing.js';

const WORKABLE = new Set(['CONFIRMED', 'IN_KITCHEN']);

@Injectable()
export class KitchenBoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenTime: KitchenTime,
  ) {}

  async board(date: string) {
    const deliveryDate = this.kitchenTime.assertDateString(date);
    const target = this.kitchenTime.fromDateString(deliveryDate);
    const now = this.kitchenTime.now();

    const orders = await this.prisma.order.findMany({
      where: {
        deliveryDate: target,
        status: { in: ['CONFIRMED', 'IN_KITCHEN', 'READY'] },
      },
      orderBy: { deliveryTime: 'asc' },
      include: {
        company: { select: { id: true, name: true } },
        prepUnits: {
          include: {
            orderCombination: {
              include: {
                options: true,
                orderLine: { select: { dishSku: true, dishName: true } },
              },
            },
          },
        },
      },
    });

    const stations = new Map<string, ReturnType<typeof stationBucket>>();

    for (const order of orders) {
      const planned = this.plannedFor(order, deliveryDate);
      const allDone = order.prepUnits.every((unit) => unit.status === 'READY');
      const timing = kitchenTimingState(now, planned.kitchenReadyAt, allDone);

      for (const unit of order.prepUnits) {
        const key = unit.kitchenStationCode;
        if (!stations.has(key)) {
          stations.set(key, stationBucket(unit));
        }

        const station = stations.get(key)!;
        let orderRow = station.orders.find((entry) => entry.id === order.id);

        if (!orderRow) {
          orderRow = {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            company: order.company,
            planned,
            timing,
            units: [],
          };
          station.orders.push(orderRow);
        }

        orderRow.units.push(this.toUnit(unit));
      }
    }

    return {
      date: deliveryDate,
      evaluatedAt: now.toISOString(),
      stations: [...stations.values()],
    };
  }

  async start(id: string) {
    return this.mutateUnit(id, 'start');
  }

  async done(id: string) {
    return this.mutateUnit(id, 'done');
  }

  async forceComplete(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { prepUnits: true },
      });

      if (!order) {
        throw new PrepUnitNotFoundError(orderId);
      }

      if (!WORKABLE.has(order.status) && order.status !== 'READY') {
        throw new KitchenOrderNotWorkableError(orderId, order.status);
      }

      const now = this.kitchenTime.now();
      let firstStart = !order.kitchenStartedAt;

      for (const unit of order.prepUnits) {
        if (unit.status === 'READY') {
          continue;
        }

        await tx.prepUnit.update({
          where: { id: unit.id },
          data: {
            status: 'READY',
            startedAt: unit.startedAt ?? now,
            completedAt: unit.completedAt ?? now,
          },
        });
      }

      if (firstStart) {
        await this.markKitchenStarted(tx, order.id, now, order.status);
      }

      await this.maybeMarkReady(tx, order.id, now);

      return this.boardOrder(tx, order.id);
    });
  }

  private async mutateUnit(id: string, action: 'start' | 'done') {
    return this.prisma.$transaction(async (tx) => {
      // Locate the aggregate without locking a child first. All kitchen
      // writers take Order -> PrepUnit, matching force-complete and line edits.
      const reference = await tx.prepUnit.findUnique({
        where: { id },
        select: { orderId: true },
      });
      if (!reference) {
        throw new PrepUnitNotFoundError(id);
      }
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${reference.orderId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "PrepUnit" WHERE id = ${id} FOR UPDATE`;
      const unit = await tx.prepUnit.findUnique({
        where: { id },
        include: { order: { select: { id: true, status: true, kitchenStartedAt: true } } },
      });

      if (!unit) {
        throw new PrepUnitNotFoundError(id);
      }

      if (!WORKABLE.has(unit.order.status)) {
        throw new KitchenOrderNotWorkableError(unit.order.id, unit.order.status);
      }

      const now = this.kitchenTime.now();

      if (action === 'start') {
        if (unit.status !== 'PENDING') {
          throw new PrepUnitConflictError(
            'PREP_UNIT_ALREADY_STARTED',
            'That prep unit has already been started.',
            { id, status: unit.status },
          );
        }

        await tx.prepUnit.update({
          where: { id },
          data: { status: 'IN_PROGRESS', startedAt: now },
        });

        if (!unit.order.kitchenStartedAt) {
          await this.markKitchenStarted(tx, unit.order.id, now, unit.order.status);
        }
      } else {
        if (unit.status === 'READY') {
          throw new PrepUnitConflictError(
            'PREP_UNIT_ALREADY_DONE',
            'That prep unit is already done.',
            { id, status: unit.status },
          );
        }

        await tx.prepUnit.update({
          where: { id },
          data: {
            status: 'READY',
            startedAt: unit.startedAt ?? now,
            completedAt: now,
          },
        });

        if (!unit.order.kitchenStartedAt) {
          await this.markKitchenStarted(tx, unit.order.id, now, unit.order.status);
        }

        await this.maybeMarkReady(tx, unit.order.id, now);
      }

      return this.boardOrder(tx, unit.order.id);
    });
  }

  private async markKitchenStarted(
    tx: Prisma.TransactionClient,
    orderId: string,
    now: Date,
    status: string,
  ) {
    await tx.order.update({
      where: { id: orderId },
      data: {
        kitchenStartedAt: now,
        ...(status === 'CONFIRMED' ? { status: 'IN_KITCHEN' } : {}),
      },
    });

    const already = await tx.orderEvent.findFirst({
      where: { orderId, type: 'KITCHEN_STARTED' },
      select: { id: true },
    });

    if (!already) {
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'KITCHEN_STARTED',
          actorType: 'SYSTEM',
        },
      });
    }
  }

  private async maybeMarkReady(
    tx: Prisma.TransactionClient,
    orderId: string,
    now: Date,
  ) {
    const remaining = await tx.prepUnit.count({
      where: { orderId, status: { not: 'READY' } },
    });

    if (remaining > 0) {
      return;
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: 'READY' },
    });

    const already = await tx.orderEvent.findFirst({
      where: { orderId, type: 'KITCHEN_READY' },
      select: { id: true },
    });

    if (!already) {
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'KITCHEN_READY',
          actorType: 'SYSTEM',
          occurredAt: now,
        },
      });
    }
  }

  private plannedFor(
    order: {
      deliveryDate: Date;
      deliveryTime: Date;
      leaveKitchenMinutes: number;
      kitchenReadyAt: Date | null;
      dispatchReadyAt: Date | null;
    },
    deliveryDate: string,
  ) {
    if (order.kitchenReadyAt && order.dispatchReadyAt) {
      return {
        kitchenReadyAt: order.kitchenReadyAt,
        dispatchReadyAt: order.dispatchReadyAt,
      };
    }

    return plannedKitchenTimes(
      this.kitchenTime.combineDateAndTime(
        deliveryDate,
        this.kitchenTime.toTimeString(order.deliveryTime),
      ),
      order.leaveKitchenMinutes,
    );
  }

  private toUnit(unit: {
    id: string;
    status: string;
    quantity: number;
    dishName: string;
    kitchenStationId: string | null;
    kitchenStationCode: string;
    kitchenStationName: string;
    startedAt: Date | null;
    completedAt: Date | null;
    orderCombination: {
      signature: string;
      options: { optionName: string; optionGroupName: string }[];
      orderLine: { dishSku: string; dishName: string };
    };
  }) {
    return {
      id: unit.id,
      status: unit.status,
      quantity: unit.quantity,
      dish: {
        name: unit.dishName,
        sku: unit.orderCombination.orderLine.dishSku,
      },
      station: {
        id: unit.kitchenStationId,
        code: unit.kitchenStationCode,
        name: unit.kitchenStationName,
      },
      combination: {
        signature: unit.orderCombination.signature,
        options: unit.orderCombination.options.map((option) => ({
          group: option.optionGroupName,
          name: option.optionName,
        })),
      },
      startedAt: unit.startedAt,
      doneAt: unit.completedAt,
    };
  }

  private async boardOrder(tx: Prisma.TransactionClient, id: string) {
    return tx.order.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        status: true,
        kitchenStartedAt: true,
        kitchenReadyAt: true,
        dispatchReadyAt: true,
        prepUnits: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    });
  }
}

function stationBucket(unit: {
  kitchenStationId: string | null;
  kitchenStationCode: string;
  kitchenStationName: string;
}) {
  return {
    station: {
      id: unit.kitchenStationId,
      code: unit.kitchenStationCode,
      name: unit.kitchenStationName,
    },
    orders: [] as {
      id: string;
      orderNumber: string;
      status: string;
      company: { id: string; name: string };
      planned: { kitchenReadyAt: Date; dispatchReadyAt: Date };
      timing: KitchenTimingState;
      units: ReturnType<KitchenBoardService['toUnit']>[];
    }[],
  };
}
