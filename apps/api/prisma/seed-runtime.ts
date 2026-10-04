import { ConfigService } from '@nestjs/config';
import type { Prisma, OrderStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { CombinationValidator } from '../src/catalogue/combinations/combination-validator.js';
import { DriverEligibilityService } from '../src/companies/domain/driver-eligibility.service.js';
import { DispatchService } from '../src/dispatch/dispatch.service.js';
import { KitchenBoardService } from '../src/kitchen/board/kitchen-board.service.js';
import { KitchenCalendar } from '../src/kitchen/calendar/kitchen-calendar.service.js';
import { CutoffService } from '../src/kitchen/cutoff/cutoff.service.js';
import { SettingsService } from '../src/kitchen/settings/settings.service.js';
import { FixedClock } from '../src/kitchen/time/clock.js';
import { KitchenTime } from '../src/kitchen/time/kitchen-time.js';
import { WEEKDAYS } from '../src/kitchen/time/weekday.js';
import { MenuContextLoader } from '../src/menu/menu-context.loader.js';
import { MenuResolver } from '../src/menu/menu.resolver.js';
import { CutoffPolicy } from '../src/orders/domain/cutoff-policy.js';
import { DeliveryResolver } from '../src/orders/domain/delivery-resolver.js';
import { OrderBuilder } from '../src/orders/domain/order-builder.js';
import { OrderPricer } from '../src/orders/domain/order-pricer.js';
import { assertTransition } from '../src/orders/domain/order-state.js';
import { OrderRepository } from '../src/orders/order.repository.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PricingResolver } from '../src/pricing/domain/pricing-resolver.js';
import { ExplicitPriceStrategy } from '../src/pricing/domain/strategies/explicit-price.strategy.js';
import { CostMultiplierStrategy } from '../src/pricing/domain/strategies/cost-multiplier.strategy.js';
import { BaseTierPercentageStrategy } from '../src/pricing/domain/strategies/base-tier-percentage.strategy.js';
import { PriceTierService } from '../src/pricing/price-tier.service.js';
import { PricingContextLoader } from '../src/pricing/pricing-context.loader.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { SeedClient } from './seed.js';

export interface SeedOptions { now?: Date; timeZone?: string }
export function seedTime(options: SeedOptions = {}) {
  return new KitchenTime(new ConfigService({ TIMEZONE: options.timeZone ?? process.env.TIMEZONE ?? 'Asia/Kolkata' }) as never,
    new FixedClock(options.now ?? new Date()));
}
export function relativeSeedDate(time: KitchenTime, offset: number): Date {
  return time.fromDateString(DateTime.fromISO(time.today(), { zone: time.timeZone }).plus({ days: offset }).toISODate()!);
}
export function transactionSeedClient(tx: Prisma.TransactionClient): SeedClient {
  return new Proxy(tx, { get(target, property) {
    if (property === '$transaction') return (run: (client: Prisma.TransactionClient) => Promise<unknown>) => run(tx);
    return Reflect.get(target, property);
  } }) as unknown as SeedClient;
}

/** Build a pre-booked demo scenario using real delivery/menu/cutoff/kitchen/dispatch services. */
export async function createSeedScenario(prisma: SeedClient, input: {
  orderNumber: string; employeeId: string; dishId: string; deliveryDate: Date;
  status: OrderStatus; driverId?: string; deliveryTime?: string;
}, options: SeedOptions = {}): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(8715, hashtext(${input.orderNumber}))`;
    const existing = await tx.order.findUnique({ where: { orderNumber: input.orderNumber } });
    if (existing) return existing.id; // Never reset an existing reviewer's workflow/history.
    const client = transactionSeedClient(tx) as unknown as PrismaService;
    const clock = new FixedClock(options.now ?? new Date());
    const time = new KitchenTime(new ConfigService({ TIMEZONE: options.timeZone ?? process.env.TIMEZONE ?? 'Asia/Kolkata' }) as never, clock);
    const settings = new SettingsService(client, time);
    const calendar = new KitchenCalendar(client, time);
    const cutoff = new CutoffService(settings, calendar, time);
    const policy = new CutoffPolicy(cutoff, calendar);
    const pricingLoader = new PricingContextLoader(client);
    const pricing = new PricingResolver(new ExplicitPriceStrategy(), new CostMultiplierStrategy(), new BaseTierPercentageStrategy());
    const menuLoader = new MenuContextLoader(client, new PriceTierService(client, pricingLoader), pricingLoader);
    const builder = new OrderBuilder(client, new DeliveryResolver(client, time), menuLoader,
      new MenuResolver(pricing), new CombinationValidator(), new OrderPricer(pricing), policy);
    const repository = new OrderRepository(client, time);
    const orders = new OrdersService(builder, repository, policy, time);
    const date = time.toDateString(input.deliveryDate);
    const resolved = await cutoff.resolve(date);
    const evaluatedAt = clock.now();
    // Historical/today scenarios were booked before their real kitchen cutoff.
    // Keep the clock local to this seed composition; production clocks/rules do not change.
    const bookingAt = new Date(Math.min(evaluatedAt.getTime(), resolved.cutoffAt.getTime() - 60_000));
    clock.set(bookingAt);
    const actor = await tx.user.findUniqueOrThrow({ where: { email: 'admin@test.com' }, select: { id: true } });
    const created = await orders.create({ customerEmployeeId: input.employeeId, deliveryDate: date, deliveryTime: input.deliveryTime,
      lines: [{ dishId: input.dishId, quantity: 2, combinations: [{ quantity: 2 }] }],
    }, actor.id);
    await tx.order.update({ where: { id: created.id }, data: { orderNumber: input.orderNumber, createdAt: bookingAt } });
    await tx.orderEvent.updateMany({ where: { orderId: created.id, type: 'DRAFT' }, data: { occurredAt: bookingAt } });
    if (input.status === 'DRAFT') return created.id;
    if (input.status === 'CANCELLED') {
      await orders.cancel(created.id, actor.id);
      await tx.orderEvent.updateMany({ where: { orderId: created.id, type: 'CANCELLED' }, data: { occurredAt: bookingAt } });
      return created.id;
    }
    await orders.place(created.id, actor.id);
    await tx.orderEvent.updateMany({ where: { orderId: created.id, type: 'PLACED' }, data: { occurredAt: bookingAt } });
    if (input.status === 'REJECTED') {
      await orders.reject(created.id, { reason: 'Demo rejection by kitchen' }, actor.id);
      await tx.orderEvent.updateMany({ where: { orderId: created.id, type: 'REJECTED' }, data: { occurredAt: bookingAt } });
      return created.id;
    }
    if (input.status === 'PLACED' || !resolved.hasPassed) return created.id;

    // Confirm this seed-owned snapshot only; running the date-wide cutoff processor
    // here would mutate unrelated reviewer orders sharing this date.
    clock.set(new Date(resolved.cutoffAt.getTime() + 1));
    if (!(await cutoff.resolve(date)).hasPassed) throw new Error('Demo confirmation precedes cutoff');
    assertTransition('PLACED', 'CONFIRMED');
    await tx.order.update({ where: { id: created.id }, data: { status: 'CONFIRMED', confirmedAt: clock.now() } });
    await tx.orderEvent.create({ data: { orderId: created.id, type: 'CONFIRMED', actorType: 'SYSTEM', occurredAt: clock.now(), note: 'Pre-booked demo snapshot after kitchen cutoff.' } });
    if (input.status === 'CONFIRMED') return created.id;
    const operationalAt = new Date(Math.max(resolved.cutoffAt.getTime() + 2,
      Math.min(evaluatedAt.getTime(), time.combineDateAndTime(date, '10:00').getTime())));
    clock.set(operationalAt);
    const kitchen = new KitchenBoardService(client, time);
    const units = await tx.prepUnit.findMany({ where: { orderId: created.id }, select: { id: true } });
    for (const unit of units) { await kitchen.start(unit.id); await kitchen.done(unit.id); }
    const dispatch = new DispatchService(client, time, new DriverEligibilityService(client), settings);
    const drop = await dispatch.markOrderReady(created.id, actor.id);
    const driver = input.driverId ?? (await tx.staff.findUniqueOrThrow({ where: { staffCode: 'DRIVER-001' } })).id;
    await dispatch.assignDriver(drop.id, driver);
    await dispatch.markOut(drop.id, actor.id);
    await tx.orderEvent.updateMany({ where: { orderId: created.id, type: { in: ['KITCHEN_STARTED', 'KITCHEN_READY', 'DISPATCH_READY', 'OUT_FOR_DELIVERY'] } },
      data: { occurredAt: operationalAt } });
    if (input.status === 'DELIVERED') {
      const header = await tx.order.findUniqueOrThrow({ where: { id: created.id } });
      const deliveredAt = time.combineDateAndTime(date, time.toTimeString(header.deliveryTime));
      if (deliveredAt <= evaluatedAt) {
        clock.set(deliveredAt);
        await dispatch.deliver(drop.id, actor.id, { staffId: driver, note: 'Demo delivery received at reception.' });
        await tx.orderEvent.updateMany({ where: { orderId: created.id, type: 'DELIVERED' }, data: { occurredAt: deliveredAt } });
      }
    }
    return created.id;
  });
}

/** Append date-owned examples; never move yesterday's orders or reuse their Drop. */
export async function seedDailyReviewData(prisma: SeedClient, options: SeedOptions = {}): Promise<{ created: string[] }> {
  const time = seedTime(options);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(8715, hashtext('demo:review:daily'))`;
    const client = transactionSeedClient(tx);
    const tier = await tx.priceTier.findUniqueOrThrow({ where: { code: 'STANDARD' } });
    const dish = await tx.dish.findUniqueOrThrow({ where: { sku: 'FK-WRAP-001' } });
    const driver = await tx.staff.findUniqueOrThrow({ where: { staffCode: 'DRIVER-001' } });
    const packaging = await tx.packagingType.findUniqueOrThrow({ where: { code: 'INDIVIDUAL' } });
    const domain = await tx.companyDomain.findUnique({ where: { domain: 'fernleaf-demo.test' } });
    let company;
    if (domain) {
      const owner = await tx.demoOwnedRecord.findUnique({ where: { key: 'demo:review:company' } });
      if (owner?.entityId !== domain.companyId) throw new Error('Review demo domain belongs to an unowned company');
      company = await tx.company.findUniqueOrThrow({ where: { id: domain.companyId } });
    } else {
      company = await tx.company.create({ data: { name: 'Fernleaf Review Catering', priceTierId: tier.id,
        defaultDriverStaffId: driver.id, defaultPackagingTypeId: packaging.id, leaveKitchenMinutes: 60,
        defaultDeliveryTime: time.fromTimeString('14:30'), domains: { create: { domain: 'fernleaf-demo.test' } },
        workingDays: { create: WEEKDAYS.map((weekday) => ({ weekday })) },
      } });
      const address = await tx.companyAddress.create({ data: { companyId: company.id, label: 'Review office', line1: '21 Demo Park', city: 'Bengaluru', postalCode: '560001', country: 'IN' } });
      company = await tx.company.update({ where: { id: company.id }, data: { defaultAddressId: address.id } });
      await tx.demoOwnedRecord.create({ data: { key: 'demo:review:company', entityType: 'Company', entityId: company.id } });
    }
    const employee = await tx.customerEmployee.upsert({ where: { email: 'meals@fernleaf-demo.test' }, update: {},
      create: { companyId: company.id, fullName: 'Review Meal Coordinator', email: 'meals@fernleaf-demo.test', defaultAddressId: company.defaultAddressId, canChooseDeliveryTime: true },
    });
    if (employee.companyId !== company.id) throw new Error('Review demo employee belongs to another company');
    const created: string[] = [];
    for (const [label, offset, status] of [['history', -1, 'DELIVERED'], ['today', 0, 'OUT_FOR_DELIVERY'], ['future', 7, 'PLACED']] as const) {
      const key = label === 'history' ? 'demo:review:history' : `demo:review:${label}:${time.today()}`;
      const owned = await tx.demoOwnedRecord.findUnique({ where: { key } });
      if (owned && await tx.order.findUnique({ where: { id: owned.entityId } })) continue;
      const id = await createSeedScenario(client, { orderNumber: `DEMO-REVIEW-${label.toUpperCase()}-${time.today()}`,
        employeeId: employee.id, dishId: dish.id, deliveryDate: relativeSeedDate(time, offset), status, driverId: driver.id,
        deliveryTime: label === 'history' ? '12:30' : label === 'future' ? '16:30' : '14:30',
      }, options);
      await tx.demoOwnedRecord.upsert({ where: { key }, update: { entityId: id }, create: { key, entityType: 'Order', entityId: id } });
      created.push(key);
    }
    return { created };
  });
}
