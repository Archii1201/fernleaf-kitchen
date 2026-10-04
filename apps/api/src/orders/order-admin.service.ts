import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DropConflictError } from '../dispatch/dispatch.errors.js';
import {
  CompanyAddressNotFoundError,
  CompanyAddressNotOwnedError,
  PackagingTypeNotFoundError,
} from '../companies/companies.errors.js';
import { plannedKitchenTimes } from '../kitchen/board/kitchen-timing.js';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OrderStatus } from './domain/order-state.js';
import type {
  AdminAddressDto,
  AdminDeliveryTimeDto,
  AdminPackagingDto,
} from './dto/order.dto.js';
import { OrderRepository } from './order.repository.js';
import { OrdersService } from './orders.service.js';
import {
  InactiveAddressError,
  InactivePackagingError,
  OrderNotOverridableError,
} from './orders.errors.js';

const OVERRIDABLE = new Set<OrderStatus>([
  'CONFIRMED',
  'IN_KITCHEN',
  'READY',
  'DISPATCH_READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
]);

@Injectable()
export class OrderAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: OrderRepository,
    private readonly orders: OrdersService,
    private readonly kitchenTime: KitchenTime,
  ) {}

  overrideDeliveryTime(id: string, dto: AdminDeliveryTimeDto) {
    this.kitchenTime.fromTimeString(dto.deliveryTime);

    return this.mutate(id, dto.version, (order) => {
      const date = this.kitchenTime.toDateString(order.deliveryDate);
      const planned = plannedKitchenTimes(
        this.kitchenTime.combineDateAndTime(date, dto.deliveryTime),
        order.leaveKitchenMinutes,
      );

      return {
        deliveryTime: this.kitchenTime.fromTimeString(dto.deliveryTime),
        kitchenReadyAt: planned.kitchenReadyAt,
        dispatchReadyAt: planned.dispatchReadyAt,
      };
    }, true);
  }

  overrideAddress(id: string, dto: AdminAddressDto) {
    return this.mutate(id, dto.version, async (order, tx) => {
      const address = await tx.companyAddress.findUnique({
        where: { id: dto.addressId },
      });

      if (!address) {
        throw new CompanyAddressNotFoundError(dto.addressId);
      }

      if (address.companyId !== order.companyId) {
        throw new CompanyAddressNotOwnedError(dto.addressId, order.companyId);
      }

      if (!address.active) {
        throw new InactiveAddressError(dto.addressId);
      }

      return {
        deliveryAddress: { connect: { id: address.id } },
        deliveryAddressLabel: address.label,
        deliveryAddressLine1: address.line1,
        deliveryAddressLine2: address.line2,
        deliveryAddressCity: address.city,
        deliveryAddressState: address.state,
        deliveryAddressPostalCode: address.postalCode,
        deliveryAddressCountry: address.country,
      };
    }, true);
  }

  overridePackaging(id: string, dto: AdminPackagingDto) {
    return this.mutate(id, dto.version, async (order, tx) => {
      void order;
      const packaging = await tx.packagingType.findUnique({
        where: { id: dto.packagingTypeId },
        select: { id: true, name: true, active: true },
      });

      if (!packaging) {
        throw new PackagingTypeNotFoundError(dto.packagingTypeId);
      }

      if (!packaging.active) {
        throw new InactivePackagingError(dto.packagingTypeId);
      }

      return {
        packagingType: { connect: { id: packaging.id } },
        packagingTypeName: packaging.name,
      };
    });
  }

  private async mutate(
    id: string,
    version: number,
    patch: (
      order: Awaited<ReturnType<OrderRepository['findHeader']>>,
      tx: Prisma.TransactionClient,
    ) => Promise<Prisma.OrderUpdateInput> | Prisma.OrderUpdateInput,
    synchronizeDrop = false,
  ) {
    await this.prisma.$transaction(async (tx) => {
      // Dispatch departure/delivery lock Drop -> Order. Take the same order
      // when this override must also write an existing Drop.
      const membership = synchronizeDrop
        ? await tx.dropOrder.findUnique({ where: { orderId: id }, select: { dropId: true } })
        : null;
      if (membership) {
        await tx.$queryRaw`SELECT id FROM "Drop" WHERE id = ${membership.dropId} FOR UPDATE`;
      }
      const order = await this.repository.lockAndRead(tx, id, version);

      if (!OVERRIDABLE.has(order.status as OrderStatus)) {
        throw new OrderNotOverridableError(order.status);
      }

      if (synchronizeDrop) {
        const currentMembership = await tx.dropOrder.findUnique({
          where: { orderId: id }, select: { dropId: true },
        });
        if (currentMembership?.dropId !== membership?.dropId) {
          throw new DropConflictError('DROP_ORDER_MEMBERSHIP_CHANGED',
            'The order delivery group changed. Reload and retry the override.', { orderId: id });
        }
      }

      const data = await patch(order, tx);
      const updated = await tx.order.update({
        where: { id },
        data: {
          ...data,
          version: { increment: 1 },
        },
      });
      if (membership) await this.synchronizeDrop(tx, membership.dropId, updated);
    }).catch((error: unknown) => {
      if (synchronizeDrop && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DropConflictError('DROP_DELIVERY_OVERRIDE_COLLISION',
          'Another drop already uses this delivery destination. Grouping requires review.');
      }
      throw error;
    });

    return this.orders.getById(id);
  }

  private async synchronizeDrop(
    tx: Prisma.TransactionClient,
    dropId: string,
    order: Awaited<ReturnType<OrderRepository['findHeader']>>,
  ) {
    const drop = await tx.drop.findUniqueOrThrow({ where: { id: dropId } });
    if (drop.companyId === order.companyId && drop.companyAddressId === order.deliveryAddressId &&
      drop.deliveryDate.getTime() === order.deliveryDate.getTime() &&
      drop.deliveryTime.getTime() === order.deliveryTime.getTime()) return;

    if (await tx.dropOrder.count({ where: { dropId } }) !== 1) {
      throw new DropConflictError('DROP_DELIVERY_OVERRIDE_SHARED',
        'This drop contains multiple orders. Changing its delivery destination requires review.', { dropId });
    }
    const destination = {
      companyId: order.companyId,
      companyAddressId: order.deliveryAddressId,
      deliveryDate: order.deliveryDate,
      deliveryTime: order.deliveryTime,
    };
    const collision = await tx.drop.findUnique({ where: {
      companyId_companyAddressId_deliveryDate_deliveryTime: destination,
    }, select: { id: true } });
    if (collision && collision.id !== dropId) {
      throw new DropConflictError('DROP_DELIVERY_OVERRIDE_COLLISION',
        'Another drop already uses this delivery destination. Grouping requires review.', { dropId, destinationDropId: collision.id });
    }
    // Keep the existing Drop, assignment, workflow status and actuals.
    await tx.drop.update({ where: { id: dropId }, data: destination });
  }
}
