import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
    });
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
    });
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
  ) {
    await this.prisma.$transaction(async (tx) => {
      const order = await this.repository.lockAndRead(tx, id, version);

      if (!OVERRIDABLE.has(order.status as OrderStatus)) {
        throw new OrderNotOverridableError(order.status);
      }

      const data = await patch(order, tx);
      await tx.order.update({
        where: { id },
        data: {
          ...data,
          version: { increment: 1 },
        },
      });
    });

    return this.orders.getById(id);
  }
}
