import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { CutoffService } from '../kitchen/cutoff/cutoff.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DEMO_TODAY = 'demo:order:today:northwind';
const DEMO_TOMORROW = 'demo:order:tomorrow:northwind';
const DEMO_DROP = 'demo:drop:today:driver';

@Injectable()
export class DemoMaintenanceService {
  private readonly logger = new Logger(DemoMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenTime: KitchenTime,
    private readonly cutoff: CutoffService,
    private readonly orders: OrdersService,
  ) {}

  async maintain(): Promise<{ created: string[] }> {
    const created: string[] = [];
    const today = this.kitchenTime.today();
    const tomorrow = DateTime.fromISO(today, { zone: this.kitchenTime.timeZone })
      .plus({ days: 1 })
      .toISODate()!;

    const todayCutoff = await this.cutoff.resolve(today);
    const todayDate = todayCutoff.hasPassed ? tomorrow : today;

    if (!(await this.exists(DEMO_TODAY))) {
      const id = await this.createLegalOrder(DEMO_TODAY, todayDate);
      if (id) {
        created.push(DEMO_TODAY);
      }
    }

    if (!(await this.exists(DEMO_TOMORROW))) {
      const id = await this.createLegalOrder(DEMO_TOMORROW, tomorrow);
      if (id) {
        created.push(DEMO_TOMORROW);
      }
    }

    if (!(await this.exists(DEMO_DROP))) {
      const dropId = await this.ensureDriverDrop(today);
      if (dropId) {
        created.push(DEMO_DROP);
      }
    }

    this.logger.log(`Demo maintenance created ${created.length} missing records`);
    return { created };
  }

  private async exists(key: string): Promise<boolean> {
    const row = await this.prisma.demoOwnedRecord.findUnique({
      where: { key },
      select: { entityId: true },
    });
    if (!row) {
      return false;
    }
    if (row.entityId && (await this.entityStillPresent(key, row.entityId))) {
      return true;
    }
    await this.prisma.demoOwnedRecord.delete({ where: { key } });
    return false;
  }

  private async entityStillPresent(key: string, entityId: string): Promise<boolean> {
    if (key.startsWith('demo:drop')) {
      return Boolean(await this.prisma.drop.findUnique({ where: { id: entityId }, select: { id: true } }));
    }
    return Boolean(await this.prisma.order.findUnique({ where: { id: entityId }, select: { id: true } }));
  }

  private async createLegalOrder(key: string, date: string): Promise<string | null> {
    const employee = await this.prisma.customerEmployee.findUnique({
      where: { email: 'alice@northwind.com' },
      select: { id: true },
    });
    const dish = await this.prisma.dish.findUnique({
      where: { sku: 'FK-WRAP-001' },
      select: { id: true },
    });
    if (!employee || !dish) {
      return null;
    }

    const admin = await this.prisma.user.findUnique({
      where: { email: 'admin@test.com' },
      select: { id: true },
    });

    try {
      const created = await this.orders.create(
        {
          customerEmployeeId: employee.id,
          deliveryDate: date,
          lines: [{ dishId: dish.id, quantity: 2, combinations: [{ quantity: 2 }] }],
        },
        admin?.id ?? '',
      );
      await this.prisma.demoOwnedRecord.create({
        data: { key, entityType: 'Order', entityId: created.id },
      });
      return created.id;
    } catch (error) {
      this.logger.warn(
        `Skipped demo order ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async ensureDriverDrop(today: string): Promise<string | null> {
    const driver = await this.prisma.staff.findUnique({
      where: { staffCode: 'DRIVER-001' },
      select: { id: true },
    });
    const owned = await this.prisma.demoOwnedRecord.findUnique({
      where: { key: DEMO_TODAY },
    });
    if (!driver || !owned) {
      return null;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: owned.entityId },
    });
    if (!order) {
      return null;
    }

    const drop = await this.prisma.drop.upsert({
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
        driverStaffId: driver.id,
      },
      update: { driverStaffId: driver.id },
    });
    await this.prisma.dropOrder.upsert({
      where: { orderId: order.id },
      create: { dropId: drop.id, orderId: order.id },
      update: { dropId: drop.id },
    });
    await this.prisma.demoOwnedRecord.create({
      data: { key: DEMO_DROP, entityType: 'Drop', entityId: drop.id },
    });
    void today;
    return drop.id;
  }
}
