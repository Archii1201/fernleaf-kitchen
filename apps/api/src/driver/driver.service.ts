import { Injectable } from '@nestjs/common';
import { DispatchService } from '../dispatch/dispatch.service.js';
import { DropNotOwnedError } from '../dispatch/dispatch.errors.js';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DriverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenTime: KitchenTime,
    private readonly dispatch: DispatchService,
  ) {}

  async listToday(userId: string) {
    const staffId = await this.requireStaffId(userId);
    const today = this.kitchenTime.fromDateString(this.kitchenTime.today());

    const rows = await this.prisma.drop.findMany({
      where: { driverStaffId: staffId, deliveryDate: today },
      orderBy: { deliveryTime: 'asc' },
      include: {
        company: { select: { id: true, name: true } },
        companyAddress: {
          select: { id: true, label: true, line1: true, city: true },
        },
        orders: {
          include: {
            order: { select: { id: true, orderNumber: true, status: true } },
          },
        },
      },
    });

    return {
      date: this.kitchenTime.toDateString(today),
      drops: rows.map((row) => ({
        id: row.id,
        status: row.status,
        deliveryTime: this.kitchenTime.toTimeString(row.deliveryTime),
        company: row.company,
        address: row.companyAddress,
        notes: row.notes,
        orders: row.orders.map((membership) => ({
          id: membership.order.id,
          orderNumber: membership.order.orderNumber,
          status: membership.order.status,
        })),
      })),
    };
  }

  async deliver(
    dropId: string,
    userId: string,
    options: { note?: string; photoFileId?: string },
  ) {
    const staffId = await this.requireStaffId(userId);
    return this.dispatch.deliver(dropId, userId, { ...options, staffId });
  }

  private async requireStaffId(userId: string): Promise<string> {
    const staff = await this.prisma.staff.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!staff) {
      throw new DropNotOwnedError(userId);
    }

    return staff.id;
  }
}
