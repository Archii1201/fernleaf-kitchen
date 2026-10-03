import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { BILLABLE_STATUSES } from '../billing/billing.service.js';
import { CutoffService } from '../kitchen/cutoff/cutoff.service.js';
import { KitchenBoardService } from '../kitchen/board/kitchen-board.service.js';
import {
  AT_RISK_WINDOW_MINUTES,
  kitchenTimingState,
} from '../kitchen/board/kitchen-timing.js';
import { SETTINGS_ID } from '../kitchen/settings/settings.service.js';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { PrismaService } from '../prisma/prisma.service.js';

const EXCLUDED = ['CANCELLED', 'REJECTED'] as const;
const OPERATIONAL = [
  'CONFIRMED',
  'IN_KITCHEN',
  'READY',
  'DISPATCH_READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenTime: KitchenTime,
    private readonly cutoff: CutoffService,
    private readonly board: KitchenBoardService,
  ) {}

  async admin() {
    const today = this.kitchenTime.today();
    const todayDate = this.kitchenTime.fromDateString(today);
    const now = this.kitchenTime.now();

    const [ordersToday, meals, units, week, uninvoiced, outstanding, nextCutoff, pendingCutoff, gaps] =
      await Promise.all([
        this.prisma.order.count({
          where: { deliveryDate: todayDate, status: { notIn: [...EXCLUDED] } },
        }),
        this.prisma.orderLine.aggregate({
          where: {
            order: { deliveryDate: todayDate, status: { notIn: [...EXCLUDED] } },
          },
          _sum: { quantity: true },
        }),
        this.unitProgress(todayDate),
        this.nextSevenDays(today),
        this.prisma.order.aggregate({
          where: { invoiceId: null, status: { in: [...BILLABLE_STATUSES] } },
          _sum: { totalCents: true },
          _count: true,
        }),
        this.prisma.invoice.aggregate({
          where: { status: 'ISSUED' },
          _sum: { totalCents: true },
          _count: true,
        }),
        this.nextRelevantCutoff(today),
        this.pendingCutoffDates(today),
        this.setupGaps(),
      ]);

    const completed = units.completed;
    const total = units.total;

    return {
      date: today,
      timeZone: this.kitchenTime.timeZone,
      evaluatedAt: now.toISOString(),
      metrics: {
        ordersToday,
        mealsToday: meals._sum.quantity ?? 0,
        kitchenProgress: {
          totalUnits: total,
          completedUnits: completed,
          percentComplete: total === 0 ? 0 : Math.round((completed * 100) / total),
        },
        nextCutoff,
        pendingCutoff,
        uninvoicedBalanceCents: uninvoiced._sum.totalCents ?? 0,
        uninvoicedOrderCount: uninvoiced._count,
        outstandingInvoices: {
          count: outstanding._count,
          totalCents: outstanding._sum.totalCents ?? 0,
        },
      },
      groups: { next7Days: week },
      lists: { setupGaps: gaps },
    };
  }

  async kitchen() {
    const today = this.kitchenTime.today();
    const tomorrow = DateTime.fromISO(today, { zone: this.kitchenTime.timeZone })
      .plus({ days: 1 })
      .toISODate()!;
    const todayDate = this.kitchenTime.fromDateString(today);
    const now = this.kitchenTime.now();
    const board = await this.board.board(today);
    const tomorrowBoard = await this.board.board(tomorrow);

    const units = this.flattenUnits(board);
    const byStation = this.groupStation(units);
    const late = units.filter((unit) => unit.timing === 'LATE');
    const atRisk = units.filter((unit) => unit.timing === 'AT_RISK');
    const upcoming = units
      .filter((unit) => unit.kitchenReadyAt && unit.kitchenReadyAt.getTime() > now.getTime() && unit.status !== 'READY')
      .sort((a, b) => a.kitchenReadyAt!.getTime() - b.kitchenReadyAt!.getTime());

    return {
      date: today,
      timeZone: this.kitchenTime.timeZone,
      evaluatedAt: now.toISOString(),
      metrics: {
        unitsToday: units.length,
        late: late.length,
        atRisk: atRisk.length,
        atRiskWindowMinutes: AT_RISK_WINDOW_MINUTES,
        nextDeadline: upcoming[0]
          ? { at: upcoming[0].kitchenReadyAt, orderNumber: upcoming[0].orderNumber, station: upcoming[0].station }
          : null,
      },
      groups: {
        unitsByStation: byStation,
        tomorrow: {
          date: tomorrow,
          units: this.flattenUnits(tomorrowBoard).length,
          byStation: this.groupStation(this.flattenUnits(tomorrowBoard)),
        },
      },
      lists: { prep: units },
    };
  }

  async dispatch() {
    const today = this.kitchenTime.today();
    const todayDate = this.kitchenTime.fromDateString(today);
    const now = this.kitchenTime.now();

    const drops = await this.prisma.drop.findMany({
      where: { deliveryDate: todayDate },
      include: {
        driver: { select: { id: true, fullName: true, staffCode: true } },
        company: { select: { name: true } },
        orders: {
          include: {
            order: { select: { dispatchReadyAt: true, status: true } },
          },
        },
      },
      orderBy: { deliveryTime: 'asc' },
    });

    const byStatus: Record<string, number> = {};
    const needsDriver: unknown[] = [];
    const leavingSoon: unknown[] = [];
    const late: unknown[] = [];
    const load = new Map<string, { driver: string; count: number }>();

    for (const drop of drops) {
      byStatus[drop.status] = (byStatus[drop.status] ?? 0) + 1;
      const key = drop.driver?.id ?? 'unassigned';
      const current = load.get(key) ?? {
        driver: drop.driver?.fullName ?? 'Unassigned',
        count: 0,
      };
      current.count += 1;
      load.set(key, current);

      const dispatchAt = drop.orders
        .map((row) => row.order.dispatchReadyAt)
        .filter((value): value is Date => value !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0];

      const open = drop.status !== 'DELIVERED' && drop.status !== 'CANCELLED';
      if (open && !drop.driverStaffId) {
        needsDriver.push(this.dropCard(drop));
      }
      if (open && drop.status !== 'OUT_FOR_DELIVERY' && dispatchAt) {
        const mins = (dispatchAt.getTime() - now.getTime()) / 60_000;
        if (mins <= 30 && mins > 0) {
          leavingSoon.push(this.dropCard(drop, dispatchAt));
        }
        if (now.getTime() > dispatchAt.getTime()) {
          late.push(this.dropCard(drop, dispatchAt));
        }
      }
    }

    const delivered = drops.filter((drop) => drop.status === 'DELIVERED');
    const onTime = delivered.filter((drop) => drop.onTime === true).length;

    return {
      date: today,
      timeZone: this.kitchenTime.timeZone,
      evaluatedAt: now.toISOString(),
      metrics: {
        dropsToday: drops.length,
        needsDriver: needsDriver.length,
        leavingSoon: leavingSoon.length,
        late: late.length,
        onTimeRatePercent:
          delivered.length === 0 ? null : Math.round((onTime * 100) / delivered.length),
        deliveredToday: delivered.length,
      },
      groups: {
        byStatus,
        driverLoad: [...load.values()],
      },
      lists: { needsDriver, leavingSoon, late },
    };
  }

  async driver(userId: string) {
    const today = this.kitchenTime.today();
    const todayDate = this.kitchenTime.fromDateString(today);
    const staff = await this.prisma.staff.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!staff) {
      return {
        date: today,
        timeZone: this.kitchenTime.timeZone,
        metrics: { assigned: 0, delivered: 0, remaining: 0, percentDelivered: 0, onTimeCount: 0 },
        lists: { nextDrop: null },
      };
    }

    const drops = await this.prisma.drop.findMany({
      where: { driverStaffId: staff.id, deliveryDate: todayDate },
      orderBy: { deliveryTime: 'asc' },
      include: {
        company: { select: { name: true } },
        companyAddress: { select: { label: true, line1: true, city: true } },
      },
    });

    const delivered = drops.filter((drop) => drop.status === 'DELIVERED');
    const remaining = drops.filter((drop) => drop.status !== 'DELIVERED' && drop.status !== 'CANCELLED');
    const next = remaining[0] ?? null;

    return {
      date: today,
      timeZone: this.kitchenTime.timeZone,
      metrics: {
        assigned: drops.length,
        delivered: delivered.length,
        remaining: remaining.length,
        percentDelivered:
          drops.length === 0 ? 0 : Math.round((delivered.length * 100) / drops.length),
        onTimeCount: delivered.filter((drop) => drop.onTime === true).length,
      },
      lists: {
        nextDrop: next
          ? {
              id: next.id,
              time: this.kitchenTime.toTimeString(next.deliveryTime),
              status: next.status,
              company: next.company.name,
              address: next.companyAddress,
            }
          : null,
      },
    };
  }

  private async unitProgress(todayDate: Date) {
    const [total, completed] = await Promise.all([
      this.prisma.prepUnit.count({
        where: {
          order: { deliveryDate: todayDate, status: { in: [...OPERATIONAL] } },
        },
      }),
      this.prisma.prepUnit.count({
        where: {
          status: 'READY',
          order: { deliveryDate: todayDate, status: { in: [...OPERATIONAL] } },
        },
      }),
    ]);
    return { total, completed };
  }

  private async nextSevenDays(today: string) {
    const rows = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = DateTime.fromISO(today, { zone: this.kitchenTime.timeZone })
        .plus({ days: offset })
        .toISODate()!;
      const deliveryDate = this.kitchenTime.fromDateString(date);
      const [orders, meals] = await Promise.all([
        this.prisma.order.count({
          where: { deliveryDate, status: { notIn: [...EXCLUDED] } },
        }),
        this.prisma.orderLine.aggregate({
          where: { order: { deliveryDate, status: { notIn: [...EXCLUDED] } } },
          _sum: { quantity: true },
        }),
      ]);
      rows.push({ date, orders, meals: meals._sum.quantity ?? 0 });
    }
    return rows;
  }

  private async nextRelevantCutoff(today: string) {
    for (let offset = 0; offset <= 10; offset += 1) {
      const date = DateTime.fromISO(today, { zone: this.kitchenTime.timeZone })
        .plus({ days: offset })
        .toISODate()!;
      const cutoff = await this.cutoff.resolve(date);
      if (!cutoff.hasPassed) {
        return {
          deliveryDate: date,
          cutoffAt: cutoff.cutoffAt.toISOString(),
          cutoffDate: cutoff.cutoffDate,
        };
      }
    }
    return null;
  }

  private async pendingCutoffDates(today: string) {
    const pending: { date: string; cutoffAt: string }[] = [];
    for (let offset = -7; offset <= 0; offset += 1) {
      const date = DateTime.fromISO(today, { zone: this.kitchenTime.timeZone })
        .plus({ days: offset })
        .toISODate()!;
      const cutoff = await this.cutoff.resolve(date);
      if (!cutoff.hasPassed) {
        continue;
      }
      const run = await this.prisma.cutoffRun.findFirst({
        where: {
          targetDeliveryDate: this.kitchenTime.fromDateString(date),
          status: 'COMPLETED',
        },
        select: { id: true },
      });
      if (!run) {
        pending.push({ date, cutoffAt: cutoff.cutoffAt.toISOString() });
      }
    }
    return pending;
  }

  private async setupGaps() {
    const gaps: { code: string; message: string }[] = [];
    const [defaultTier, settings, companies, unpriced] = await Promise.all([
      this.prisma.priceTier.findFirst({ where: { isDefault: true, active: true } }),
      this.prisma.kitchenSettings.findUnique({ where: { id: SETTINGS_ID } }),
      this.prisma.company.findMany({
        where: { active: true },
        select: { id: true, name: true, defaultAddressId: true, priceTierId: true },
      }),
      this.prisma.dish.count({
        where: { active: true, menuCategories: { none: {} } },
      }),
    ]);

    if (!defaultTier) {
      gaps.push({ code: 'DEFAULT_TIER', message: 'No active default price tier.' });
    }
    if (!settings) {
      gaps.push({ code: 'KITCHEN_SETTINGS', message: 'Kitchen settings have not been configured.' });
    }
    for (const company of companies) {
      if (!company.defaultAddressId) {
        gaps.push({ code: 'COMPANY_ADDRESS', message: `${company.name} has no default delivery address.` });
      }
      if (!company.priceTierId) {
        gaps.push({ code: 'COMPANY_TIER', message: `${company.name} has no price tier.` });
      }
    }
    if (unpriced > 0) {
      gaps.push({
        code: 'MENU_GAPS',
        message: `${unpriced} active dish(es) are not on any menu category.`,
      });
    }
    return gaps;
  }

  private flattenUnits(board: Awaited<ReturnType<KitchenBoardService['board']>>) {
    const units: {
      id: string;
      status: string;
      station: string;
      dish: string;
      orderNumber: string;
      timing: string;
      kitchenReadyAt: Date | null;
    }[] = [];

    for (const station of board.stations) {
      for (const order of station.orders) {
        for (const unit of order.units) {
          units.push({
            id: unit.id,
            status: unit.status,
            station: unit.station.code || 'Unassigned',
            dish: unit.dish.name,
            orderNumber: order.orderNumber,
            timing: kitchenTimingState(
              this.kitchenTime.now(),
              order.planned.kitchenReadyAt,
              unit.status === 'READY',
            ),
            kitchenReadyAt: order.planned.kitchenReadyAt,
          });
        }
      }
    }
    return units;
  }

  private groupStation(
    units: { station: string }[],
  ): { station: string; count: number }[] {
    const map = new Map<string, number>();
    for (const unit of units) {
      map.set(unit.station, (map.get(unit.station) ?? 0) + 1);
    }
    return [...map.entries()].map(([station, count]) => ({ station, count }));
  }

  private dropCard(
    drop: {
      id: string;
      status: string;
      deliveryTime: Date;
      company: { name: string };
      driver: { fullName: string } | null;
    },
    dispatchAt?: Date,
  ) {
    return {
      id: drop.id,
      status: drop.status,
      time: this.kitchenTime.toTimeString(drop.deliveryTime),
      company: drop.company.name,
      driver: drop.driver?.fullName ?? null,
      dispatchReadyAt: dispatchAt ?? null,
    };
  }
}
