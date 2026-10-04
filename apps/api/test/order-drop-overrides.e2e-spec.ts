import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { plannedKitchenTimes } from '../src/kitchen/board/kitchen-timing.js';
import { CLOCK, FixedClock } from '../src/kitchen/time/clock.js';
import { KitchenTime } from '../src/kitchen/time/kitchen-time.js';
import { OrderAdminService } from '../src/orders/order-admin.service.js';
import { OrderRepository } from '../src/orders/order.repository.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const DATE = '2031-03-05';
const NOW = new Date('2031-03-05T06:00:00Z');

describe('P0-5 delivery override and Drop synchronization (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let time: KitchenTime;
  let adminCookie: string;
  let dispatchCookie: string;
  let driverCookie: string;
  let companyId: string;
  let employeeId: string;
  let driverId: string;
  let tierId: string;
  let tierName: string;
  let dish: { id: string; sku: string; name: string; kitchenStation: { id: string; code: string; name: string } };
  let bagId: string;
  let boxId: string;
  const addresses: { id: string; label: string; line1: string; city: string; postalCode: string; country: string }[] = [];
  const orderIds: string[] = [];
  const dropIds: string[] = [];
  const invoiceIds: string[] = [];
  const suffix = randomUUID();

  async function login(email: string) {
    const result = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email, password: SEED_PASSWORD }).expect(200);
    return (result.headers['set-cookie'] as unknown as string[]).find((value) => value.startsWith(AUTH_COOKIE_NAME))!;
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK).useValue(new FixedClock(NOW)).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    time = app.get(KitchenTime);
    adminCookie = await login('admin@test.com');
    dispatchCookie = await login('dispatch@test.com');
    driverCookie = await login('driver@test.com');
    driverId = (await prisma.staff.findFirstOrThrow({ where: { user: { email: 'driver@test.com' } } })).id;
    const tier = await prisma.priceTier.findFirstOrThrow({ where: { isDefault: true } });
    tierId = tier.id;
    tierName = tier.name;
    dish = await prisma.dish.findUniqueOrThrow({ where: { sku: 'FK-WRAP-001' },
      select: { id: true, sku: true, name: true, kitchenStation: { select: { id: true, code: true, name: true } } },
    });
    boxId = (await prisma.packagingType.findUniqueOrThrow({ where: { code: 'INDIVIDUAL' } })).id;
    bagId = (await prisma.packagingType.findUniqueOrThrow({ where: { code: 'BUFFET' } })).id;
    companyId = (await prisma.company.create({ data: {
      name: `P05 ${suffix}`, priceTierId: tierId, defaultDriverStaffId: driverId,
    } })).id;
    for (const index of [0, 1]) addresses.push(await prisma.companyAddress.create({ data: {
      companyId, label: `P05 address ${index}`, line1: `${index + 1} Override Street`,
      city: 'Bengaluru', postalCode: '560001', country: 'IN',
    } }));
    employeeId = (await prisma.customerEmployee.create({ data: {
      companyId, email: `p05-${suffix}@example.test`, fullName: 'P05 Employee',
    } })).id;
  }, 30_000);

  afterEach(async () => {
    if (!prisma) return;
    if (orderIds.length) {
      await prisma.order.updateMany({ where: { id: { in: orderIds } }, data: { invoiceId: null } });
      await prisma.dropOrder.deleteMany({ where: { orderId: { in: orderIds } } });
    }
    if (invoiceIds.length) await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    if (orderIds.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    if (dropIds.length) await prisma.drop.deleteMany({ where: { id: { in: dropIds } } });
    orderIds.length = dropIds.length = invoiceIds.length = 0;
  });
  afterAll(async () => {
    if (prisma) {
      if (employeeId) await prisma.customerEmployee.delete({ where: { id: employeeId } });
      if (addresses.length) await prisma.companyAddress.deleteMany({ where: { id: { in: addresses.map((a) => a.id) } } });
      if (companyId) await prisma.company.delete({ where: { id: companyId } });
    }
    await app?.close();
  });

  async function create(options: {
    status?: 'CONFIRMED' | 'READY' | 'DISPATCH_READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
    deliveryTime?: string; addressIndex?: number; driver?: string | null; noDrop?: boolean;
  } = {}) {
    const address = addresses[options.addressIndex ?? 0]!;
    const status = options.status ?? 'CONFIRMED';
    const deliveryTime = time.fromTimeString(options.deliveryTime ?? '12:30');
    const order = await prisma.order.create({ data: {
      orderNumber: `P05-${randomUUID()}`, companyId, customerEmployeeId: employeeId,
      status, version: 3, deliveryDate: time.fromDateString(DATE), deliveryTime,
      deliveryAddressId: address.id, deliveryAddressLabel: address.label,
      deliveryAddressLine1: address.line1, deliveryAddressCity: address.city,
      deliveryAddressPostalCode: address.postalCode, deliveryAddressCountry: address.country,
      packagingTypeId: boxId, packagingTypeName: 'Individual', driverStaffId: driverId,
      priceTierId: tierId, priceTierName: tierName, leaveKitchenMinutes: 60,
      ...plannedKitchenTimes(time.combineDateAndTime(DATE, options.deliveryTime ?? '12:30'), 60),
      kitchenStartedAt: NOW, subtotalCents: 2099, totalCents: 2099,
      lines: { create: { dishId: dish.id, dishSku: dish.sku, dishName: dish.name, dishTemperature: 'HOT',
        kitchenStationId: dish.kitchenStation.id, kitchenStationCode: dish.kitchenStation.code,
        kitchenStationName: dish.kitchenStation.name, quantity: 1, unitPriceCents: 2099, lineTotalCents: 2099,
        combinations: { create: { signature: 'no-options', quantity: 1, unitPriceCents: 2099, optionsPriceCents: 0, totalCents: 2099 } },
      } },
    } });
    orderIds.push(order.id);
    const drop = options.noDrop ? null : await prisma.drop.create({ data: {
      companyId, companyAddressId: address.id, deliveryDate: order.deliveryDate, deliveryTime,
      driverStaffId: options.driver === undefined ? driverId : options.driver,
      status: status === 'DISPATCH_READY' ? 'READY' : status === 'OUT_FOR_DELIVERY' ? 'OUT_FOR_DELIVERY' : status === 'DELIVERED' ? 'DELIVERED' : 'PENDING',
      notes: 'Keep delivery instructions', note: 'Keep existing note',
      dispatchedAt: status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED' ? NOW : null,
      outForDeliveryAt: status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED' ? NOW : null,
      deliveredAt: status === 'DELIVERED' ? NOW : null, onTime: status === 'DELIVERED' ? true : null,
      orders: { create: { orderId: order.id } },
    } });
    if (drop) dropIds.push(drop.id);
    return { order, drop };
  }
  type Fixture = Awaited<ReturnType<typeof create>>;
  async function snapshot(fixture: Fixture) {
    return {
      order: await prisma.order.findUniqueOrThrow({ where: { id: fixture.order.id }, include: {
        lines: { include: { combinations: { include: { options: true } } } }, events: true,
      } }),
      drop: fixture.drop ? await prisma.drop.findUniqueOrThrow({ where: { id: fixture.drop.id }, include: { orders: true } }) : null,
    };
  }
  const overrideTime = (fixture: Fixture, deliveryTime = '13:00', version = fixture.order.version) =>
    request(app.getHttpServer()).put(`/api/orders/${fixture.order.id}/admin/delivery-time`)
      .set('Cookie', adminCookie).send({ deliveryTime, version });
  const overrideAddress = (fixture: Fixture, addressId = addresses[1]!.id) =>
    request(app.getHttpServer()).put(`/api/orders/${fixture.order.id}/admin/address`)
      .set('Cookie', adminCookie).send({ addressId, version: fixture.order.version });

  async function assertSynchronized(fixture: Fixture) {
    const after = await snapshot(fixture);
    expect(after.drop).not.toBeNull();
    expect(after.drop!.companyId).toBe(after.order.companyId);
    expect(after.drop!.companyAddressId).toBe(after.order.deliveryAddressId);
    expect(after.drop!.deliveryDate).toEqual(after.order.deliveryDate);
    expect(after.drop!.deliveryTime).toEqual(after.order.deliveryTime);
    expect(after.drop!.orders.map((member) => member.orderId)).toEqual([after.order.id]);
    expect(after.order.version).toBe(fixture.order.version + 1);
    expect(after.order.totalCents).toBe(fixture.order.totalCents);
    expect(after.order.subtotalCents).toBe(fixture.order.subtotalCents);
    expect(after.order.kitchenStartedAt).toEqual(fixture.order.kitchenStartedAt);
    expect(after.drop!.id).toBe(fixture.drop!.id);
    for (const field of ['driverStaffId', 'status', 'notes', 'note', 'dispatchedAt', 'outForDeliveryAt', 'deliveredAt', 'onTime', 'deliveryPhotoFileId'] as const)
      expect(after.drop![field]).toEqual(fixture.drop![field]);
    return after;
  }
  async function assertViews(fixture: Fixture, deliveryTime: string, addressId: string) {
    const dispatch = await request(app.getHttpServer()).get(`/api/dispatch/drops?date=${DATE}`).set('Cookie', dispatchCookie).expect(200);
    const driver = await request(app.getHttpServer()).get('/api/driver/drops/today').set('Cookie', driverCookie).expect(200);
    const dispatchDrop = dispatch.body.drops.find((row: { id: string }) => row.id === fixture.drop!.id);
    const driverDrop = driver.body.drops.find((row: { id: string }) => row.id === fixture.drop!.id);
    expect(dispatchDrop).toMatchObject({ deliveryDate: DATE, deliveryTime, company: { id: companyId }, address: { id: addressId }, driver: { id: driverId } });
    expect(driver.body.date).toBe(DATE);
    expect(driverDrop).toMatchObject({ deliveryTime, company: { id: companyId }, address: { id: addressId } });
    expect(dispatchDrop.orders.map((row: { id: string }) => row.id)).toEqual([fixture.order.id]);
    expect(driverDrop.orders.map((row: { id: string }) => row.id)).toEqual([fixture.order.id]);
  }

  it('synchronizes confirmed delivery-time overrides and dispatch/driver views', async () => {
    const fixture = await create();
    const before = await snapshot(fixture);
    await overrideTime(fixture).expect(200);
    const after = await assertSynchronized(fixture);
    expect(time.toTimeString(after.drop!.deliveryTime)).toBe('13:00');
    expect(after.order.lines).toEqual(before.order.lines);
    expect(after.order.kitchenReadyAt).not.toEqual(before.order.kitchenReadyAt);
    await assertViews(fixture, '13:00', addresses[0]!.id);
  });

  it('synchronizes address overrides and dispatch/driver address views', async () => {
    const fixture = await create();
    await overrideAddress(fixture).expect(200);
    const after = await assertSynchronized(fixture);
    expect(after.order.deliveryAddressLine1).toBe(addresses[1]!.line1);
    await assertViews(fixture, '12:30', addresses[1]!.id);
  });

  it('keeps packaging on Order without inventing Drop fields or changing delivery/assignment', async () => {
    const fixture = await create();
    const before = await snapshot(fixture);
    await request(app.getHttpServer()).put(`/api/orders/${fixture.order.id}/admin/packaging`)
      .set('Cookie', adminCookie).send({ packagingTypeId: bagId, version: fixture.order.version }).expect(200);
    const after = await snapshot(fixture);
    expect(after.order.packagingTypeId).toBe(bagId);
    expect(after.order.version).toBe(fixture.order.version + 1);
    expect(after.drop).toEqual(before.drop);
    expect(after.order.lines).toEqual(before.order.lines);
    expect(after.order.subtotalCents).toBe(before.order.subtotalCents);
    expect(after.order.totalCents).toBe(before.order.totalCents);
    expect(after.order.deliveryTime).toEqual(before.order.deliveryTime);
    expect(after.order.deliveryAddressId).toBe(before.order.deliveryAddressId);
    expect(after.order.kitchenReadyAt).toEqual(before.order.kitchenReadyAt);
    expect(after.order.dispatchReadyAt).toEqual(before.order.dispatchReadyAt);
    await assertViews(fixture, '12:30', addresses[0]!.id);
  });

  it('preserves an unassigned Drop even when the company has a default driver', async () => {
    const fixture = await create({ driver: null });
    await overrideTime(fixture).expect(200);
    const after = await assertSynchronized(fixture);
    expect(after.drop!.driverStaffId).toBeNull();
    expect(after.order.driverStaffId).toBe(driverId);
  });

  it('rejects a foreign-company address without changing Order or Drop', async () => {
    const fixture = await create();
    const foreign = await prisma.companyAddress.findFirstOrThrow({ where: { companyId: { not: companyId } } });
    const before = await snapshot(fixture);
    await overrideAddress(fixture, foreign.id).expect(400);
    expect(await snapshot(fixture)).toEqual(before);
  });

  it('preserves existing override behavior when no Drop has been created', async () => {
    const fixture = await create({ noDrop: true });
    await overrideTime(fixture).expect(200);
    expect(await prisma.dropOrder.findUnique({ where: { orderId: fixture.order.id } })).toBeNull();
    expect(await prisma.drop.count({ where: { companyId } })).toBe(0);
  });

  it('rolls back the real Order write/version/planned times if the subsequent Drop write fails', async () => {
    const fixture = await create();
    const before = await snapshot(fixture);
    const failingPrisma = {
      $transaction: (run: (tx: Prisma.TransactionClient) => Promise<void>) => prisma.$transaction(async (tx) => {
        const drops = new Proxy(tx.drop, { get(target, property) {
          if (property === 'update') return () => target.update({
            where: { id: fixture.drop!.id }, data: { driverStaffId: randomUUID() },
          }); // Real FK failure, after the real Order update.
          return Reflect.get(target, property);
        } });
        return run(new Proxy(tx, { get(target, property) { return property === 'drop' ? drops : Reflect.get(target, property); } }));
      }),
    };
    const service = new OrderAdminService(failingPrisma as unknown as PrismaService,
      app.get(OrderRepository), app.get(OrdersService), time);
    await expect(service.overrideDeliveryTime(fixture.order.id, { deliveryTime: '13:00', version: fixture.order.version })).rejects.toThrow();
    expect(await snapshot(fixture)).toEqual(before);
  });

  it('allows one concurrent same-version time override and rejects stale overwrite of both records', async () => {
    const fixture = await create();
    const results = await Promise.all([overrideTime(fixture, '13:00'), overrideTime(fixture, '14:00')]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body.code).toBe('ORDER_VERSION_CONFLICT');
    const winner = results.findIndex((result) => result.status === 200);
    const after = await assertSynchronized(fixture);
    expect(time.toTimeString(after.drop!.deliveryTime)).toBe(winner === 0 ? '13:00' : '14:00');
    await overrideTime(fixture, '15:00').expect(409);
    expect(await snapshot(fixture)).toEqual(after);
  });

  it('does not mix competing same-version time and address overrides', async () => {
    const fixture = await create();
    const results = await Promise.all([overrideTime(fixture), overrideAddress(fixture)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body.code).toBe('ORDER_VERSION_CONFLICT');
    const after = await assertSynchronized(fixture);
    const timeWon = results[0]!.status === 200;
    expect(time.toTimeString(after.drop!.deliveryTime)).toBe(timeWon ? '13:00' : '12:30');
    expect(after.drop!.companyAddressId).toBe(addresses[timeWon ? 0 : 1]!.id);
  });

  it.each(['time', 'address'] as const)('leaves shared-Drop %s regrouping pending without partial writes', async (kind) => {
    const fixture = await create();
    const other = await create({ noDrop: true });
    await prisma.dropOrder.create({ data: { dropId: fixture.drop!.id, orderId: other.order.id } });
    const before = await snapshot(fixture);
    const otherBefore = await snapshot(other);
    await (kind === 'time' ? overrideTime(fixture) : overrideAddress(fixture)).expect(409)
      .expect(({ body }) => expect(body.code).toBe('DROP_DELIVERY_OVERRIDE_SHARED'));
    expect(await snapshot(fixture)).toEqual(before);
    expect(await snapshot(other)).toEqual(otherBefore);
  });

  it.each(['time', 'address'] as const)('leaves colliding destination %s regrouping pending without partial writes', async (kind) => {
    const fixture = await create();
    const other = await create(kind === 'time' ? { deliveryTime: '13:00' } : { addressIndex: 1 });
    const before = await snapshot(fixture);
    const otherBefore = await snapshot(other);
    await (kind === 'time' ? overrideTime(fixture) : overrideAddress(fixture)).expect(409)
      .expect(({ body }) => expect(body.code).toBe('DROP_DELIVERY_OVERRIDE_COLLISION'));
    expect(await snapshot(fixture)).toEqual(before);
    expect(await snapshot(other)).toEqual(otherBefore);
  });

  it.each(['OUT_FOR_DELIVERY', 'DELIVERED'] as const)('preserves existing late override powers and %s actuals/state', async (status) => {
    const fixture = await create({ status });
    await overrideTime(fixture).expect(200);
    await assertSynchronized(fixture);
    await assertViews(fixture, '13:00', addresses[0]!.id);
  });

  it('races delivery override against dispatch-ready without opposing Drop/Order locks', async () => {
    const fixture = await create({ status: 'READY' });
    const [override, ready] = await Promise.all([overrideTime(fixture),
      request(app.getHttpServer()).post(`/api/dispatch/orders/${fixture.order.id}/ready`).set('Cookie', dispatchCookie),
    ]);
    expect(override.status).toBe(200);
    expect(ready.status).toBe(201);
    const after = await snapshot(fixture);
    expect(after.order.status).toBe('DISPATCH_READY');
    expect(after.drop!.status).toBe('READY');
    expect(after.order.deliveryTime).toEqual(after.drop!.deliveryTime);
    expect(time.toTimeString(after.drop!.deliveryTime)).toBe('13:00');
  });

  it('races delivery override against departure without losing delivery data or workflow state', async () => {
    const fixture = await create({ status: 'DISPATCH_READY' });
    const [override, out] = await Promise.all([overrideTime(fixture),
      request(app.getHttpServer()).post(`/api/dispatch/drops/${fixture.drop!.id}/out`).set('Cookie', dispatchCookie),
    ]);
    expect(override.status).toBe(200);
    expect(out.status).toBe(201);
    const after = await snapshot(fixture);
    expect(after.order.status).toBe('OUT_FOR_DELIVERY');
    expect(after.drop!.status).toBe('OUT_FOR_DELIVERY');
    expect(after.order.deliveryTime).toEqual(after.drop!.deliveryTime);
    expect(time.toTimeString(after.drop!.deliveryTime)).toBe('13:00');
  });

  it('races delivery override against driver delivery without changing driver permissions or workflow', async () => {
    const fixture = await create({ status: 'OUT_FOR_DELIVERY' });
    const [override, delivered] = await Promise.all([overrideTime(fixture),
      request(app.getHttpServer()).post(`/api/driver/drops/${fixture.drop!.id}/deliver`).set('Cookie', driverCookie),
    ]);
    expect(override.status).toBe(200);
    expect(delivered.status).toBe(201);
    const after = await snapshot(fixture);
    expect(after.order.status).toBe('DELIVERED');
    expect(after.drop!.status).toBe('DELIVERED');
    expect(after.order.deliveryTime).toEqual(after.drop!.deliveryTime);
    expect(time.toTimeString(after.drop!.deliveryTime)).toBe('13:00');
  });

  it.each(['ISSUED', 'PAID'] as const)('retains non-monetary override allowance for a %s invoice', async (status) => {
    const fixture = await create();
    const invoice = await prisma.invoice.create({ data: {
      companyId, invoiceNumber: `P05-${randomUUID()}`, status, subtotalCents: 2099, totalCents: 2099,
      lines: { create: { type: 'ORDER', orderId: fixture.order.id, description: 'P05 order', amountCents: 2099 } },
    } });
    invoiceIds.push(invoice.id);
    await prisma.order.update({ where: { id: fixture.order.id }, data: { invoiceId: invoice.id } });
    const beforeInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { lines: true } });
    await overrideTime(fixture).expect(200);
    const after = await assertSynchronized(fixture);
    expect(after.order.invoiceId).toBe(invoice.id);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { lines: true } })).toEqual(beforeInvoice);
  });

  it('resolves two different Drops racing to the same destination with rollback for the loser', async () => {
    const first = await create();
    const second = await create({ deliveryTime: '14:30' });
    const before = await Promise.all([snapshot(first), snapshot(second)]);
    const results = await Promise.all([overrideTime(first, '13:00'), overrideTime(second, '13:00')]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body.code).toBe('DROP_DELIVERY_OVERRIDE_COLLISION');
    const fixtures = [first, second];
    for (const [index, fixture] of fixtures.entries()) {
      if (results[index]!.status === 200) await assertSynchronized(fixture);
      else expect(await snapshot(fixture)).toEqual(before[index]);
    }
  });
});
