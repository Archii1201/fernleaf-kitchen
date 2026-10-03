import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DriverEligibilityService } from '../companies/domain/driver-eligibility.service.js';
import { SettingsService } from '../kitchen/settings/settings.service.js';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertTransition, type OrderStatus } from '../orders/domain/order-state.js';
import { OrderNotFoundError } from '../orders/orders.errors.js';
import {
  DropConflictError,
  DropDriverRequiredError,
  DropNotFoundError,
  DropNotOwnedError,
} from './dispatch.errors.js';
import { isOnTime } from './domain/on-time.js';

const DROP_INCLUDE = {
  company: { select: { id: true, name: true } },
  companyAddress: {
    select: { id: true, label: true, line1: true, city: true },
  },
  driver: { select: { id: true, staffCode: true, fullName: true } },
  orders: {
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          deliveryDate: true,
          deliveryTime: true,
        },
      },
    },
  },
} satisfies Prisma.DropInclude;

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenTime: KitchenTime,
    private readonly drivers: DriverEligibilityService,
    private readonly settings: SettingsService,
  ) {}

  async list(date?: string) {
    const deliveryDate = this.kitchenTime.fromDateString(
      date ? this.kitchenTime.assertDateString(date) : this.kitchenTime.today(),
    );

    const rows = await this.prisma.drop.findMany({
      where: { deliveryDate },
      orderBy: { deliveryTime: 'asc' },
      include: DROP_INCLUDE,
    });

    return {
      date: this.kitchenTime.toDateString(deliveryDate),
      drops: rows.map((row) => this.toDispatchDrop(row)),
    };
  }

  async assignDriver(dropId: string, driverStaffId: string) {
    await this.drivers.assertEligible(driverStaffId);

    return this.prisma.$transaction(async (tx) => {
      const drop = await this.lockDrop(tx, dropId);
      if (drop.status === 'OUT_FOR_DELIVERY' || drop.status === 'DELIVERED') {
        throw new DropConflictError(
          'DROP_ALREADY_DEPARTED',
          'The driver cannot be changed after the drop has left.',
          { dropId, status: drop.status },
        );
      }

      await tx.drop.update({
        where: { id: dropId },
        data: { driverStaffId },
      });

      return this.loadDrop(tx, dropId);
    });
  }

  async markOrderReady(orderId: string, actorUserId: string) {
  return this.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT id
      FROM "Order"
      WHERE id = ${orderId}
      FOR UPDATE
    `;

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { dropOrder: true },
    });

    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    // Kitchen must finish the order before dispatch can process it.
    if (order.status !== 'READY') {
      throw new DropConflictError(
        'ORDER_NOT_KITCHEN_READY',
        'Kitchen must finish the order before dispatch-ready.',
        { orderId, status: order.status },
      );
    }

   const now = this.kitchenTime.now();

assertTransition(order.status as OrderStatus, 'DISPATCH_READY');

const dropId = await this.ensureDrop(tx, order);

await tx.order.update({
  where: { id: orderId },
  data: {
    status: 'DISPATCH_READY',
    dispatchReadyAt: now,
  },
});

await this.maybeReadyDrop(tx, dropId, now);

await this.emit(
  tx,
  orderId,
  'DISPATCH_READY',
  actorUserId,
);
    return this.loadDrop(tx, dropId);
  });
}

  async markOut(dropId: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
     const drop = await this.lockDrop(tx, dropId);

      if (drop.status === 'OUT_FOR_DELIVERY' || drop.status === 'DELIVERED') {
        throw new DropConflictError(
          'DROP_ALREADY_OUT',
          'This drop is already out for delivery.',
          { dropId, status: drop.status },
        );
      }

      if (drop.status !== 'READY') {
        throw new DropConflictError(
          'DROP_NOT_DISPATCH_READY',
          'The drop must be dispatch-ready before it can leave.',
          { dropId, status: drop.status },
        );
      }

      if (!drop.driverStaffId) {
        throw new DropDriverRequiredError(dropId);
      }

      const now = this.kitchenTime.now();
      await tx.drop.update({
        where: { id: dropId },
        data: { status: 'OUT_FOR_DELIVERY', dispatchedAt: now, outForDeliveryAt: now },
      });

      for (const membership of drop.orders) {
        assertTransition(membership.order.status as OrderStatus, 'OUT_FOR_DELIVERY');
        await tx.order.update({
          where: { id: membership.order.id },
          data: { status: 'OUT_FOR_DELIVERY' },
        });
        await this.emit(tx, membership.order.id, 'OUT_FOR_DELIVERY', actorUserId);
      }

      return this.loadDrop(tx, dropId);
    });
  }

  async deliver(
    dropId: string,
    actorUserId: string,
    options: {
      staffId?: string;
      note?: string;
      photoFileId?: string;
    } = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const drop = await this.lockDrop(tx, dropId);

      if (options.staffId && drop.driverStaffId !== options.staffId) {
        throw new DropNotOwnedError(dropId);
      }

      if (drop.status === 'DELIVERED') {
        throw new DropConflictError(
          'DROP_ALREADY_DELIVERED',
          'This drop has already been delivered.',
          { dropId, status: drop.status },
        );
      }

      if (drop.status !== 'OUT_FOR_DELIVERY') {
        throw new DropConflictError(
          'DROP_NOT_OUT',
          'The drop must be out for delivery before it can be delivered.',
          { dropId, status: drop.status },
        );
      }

      const now = this.kitchenTime.now();
      const grace = await this.settings.getDeliveryGraceMinutes();
      const deliveryAt = this.kitchenTime.combineDateAndTime(
        this.kitchenTime.toDateString(drop.deliveryDate),
        this.kitchenTime.toTimeString(drop.deliveryTime),
      );

      await tx.drop.update({
        where: { id: dropId },
        data: {
          status: 'DELIVERED',
          deliveredAt: now,
          onTime: isOnTime(now, deliveryAt, grace),
          notes: options.note ?? drop.notes,
          deliveryPhotoFileId: options.photoFileId ?? drop.deliveryPhotoFileId,
        },
      });

      for (const membership of drop.orders) {
        assertTransition(membership.order.status as OrderStatus, 'DELIVERED');
        await tx.order.update({
          where: { id: membership.order.id },
          data: { status: 'DELIVERED', deliveredAt: now },
        });
        await this.emit(tx, membership.order.id, 'DELIVERED', actorUserId, options.note);
      }

      return this.loadDrop(tx, dropId);
    });
  }

  private async lockDrop(
  tx: Prisma.TransactionClient,
  id: string,
) {
  await tx.$executeRaw`
    SELECT id
    FROM "Drop"
    WHERE id = ${id}
    FOR UPDATE
  `;

  const drop = await tx.drop.findUnique({
    where: { id },
    include: {
      orders: {
        include: {
          order: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!drop) {
    throw new DropNotFoundError(id);
  }

  return drop;
}

  private async ensureDrop(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      companyId: string;
      deliveryAddressId: string;
      deliveryDate: Date;
      deliveryTime: Date;
      dropOrder: { dropId: string } | null;
    },
  ): Promise<string> {
    if (order.dropOrder) {
      return order.dropOrder.dropId;
    }

    const drop = await tx.drop.upsert({
      where: {
        companyId_companyAddressId_deliveryDate_deliveryTime: {
          companyId: order.companyId,
          companyAddressId: order.deliveryAddressId,
          deliveryDate: order.deliveryDate,
          deliveryTime: order.deliveryTime,
        },
      },
      create: {
        companyId: order.companyId,
        companyAddressId: order.deliveryAddressId,
        deliveryDate: order.deliveryDate,
        deliveryTime: order.deliveryTime,
        status: 'PENDING',
      },
      update: {},
    });

    await tx.dropOrder.upsert({
      where: { orderId: order.id },
      create: { dropId: drop.id, orderId: order.id },
      update: { dropId: drop.id },
    });

    return drop.id;
  }

  private async maybeReadyDrop(
    tx: Prisma.TransactionClient,
    dropId: string,
    now: Date,
  ) {
    const members = await tx.dropOrder.findMany({
      where: { dropId },
      include: { order: { select: { status: true } } },
    });

   if (
  members.length === 0 ||
  members.some((row) => row.order.status !== 'DISPATCH_READY')
) {
  return;
}

    await tx.drop.update({
      where: { id: dropId },
      data: { status: 'READY' },
    });
    void now;
  }

  private async emit(
    tx: Prisma.TransactionClient,
    orderId: string,
    type: 'DISPATCH_READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED',
    actorUserId: string,
    note?: string,
  ) {
    const already = await tx.orderEvent.findFirst({
      where: { orderId, type },
      select: { id: true },
    });

    if (already) {
      return;
    }

    await tx.orderEvent.create({
      data: {
        orderId,
        type,
        actorType: 'STAFF',
        actorUserId,
        note,
      },
    });
  }

  private async loadDrop(tx: Prisma.TransactionClient, id: string) {
    return this.toDispatchDrop(
      await tx.drop.findUniqueOrThrow({ where: { id }, include: DROP_INCLUDE }),
    );
  }

  toDispatchDrop(row: Prisma.DropGetPayload<{ include: typeof DROP_INCLUDE }>) {
    return {
      id: row.id,
      status: row.status,
      deliveryDate: this.kitchenTime.toDateString(row.deliveryDate),
      deliveryTime: this.kitchenTime.toTimeString(row.deliveryTime),
      company: row.company,
      address: row.companyAddress,
      driver: row.driver,
      dispatchedAt: row.dispatchedAt,
      deliveredAt: row.deliveredAt,
      onTime: row.onTime,
      notes: row.notes,
      deliveryPhotoFileId: row.deliveryPhotoFileId,
      orders: row.orders.map((membership) => ({
        id: membership.order.id,
        orderNumber: membership.order.orderNumber,
        status: membership.order.status,
      })),
    };
  }
}
