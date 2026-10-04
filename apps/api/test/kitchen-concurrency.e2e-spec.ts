import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach } from 'vitest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { KitchenBoardService } from '../src/kitchen/board/kitchen-board.service.js';
import { KitchenTime } from '../src/kitchen/time/kitchen-time.js';
import { CLOCK, FixedClock } from '../src/kitchen/time/clock.js';
import { PriceTierService } from '../src/pricing/price-tier.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const NOW = new Date('2031-03-01T04:00:00Z');
const DATE = '2031-03-05';

describe('P0-4 kitchen aggregate concurrency (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let kitchenCookie: string;
  let employeeId: string;
  let dishId: string;
  let categoryId: string;
  let groupId: string;
  const clock = new FixedClock(NOW);
  const suffix = randomUUID();
  const optionIds: string[] = [];
  const orderIds: string[] = [];

  async function login(email: string) {
    const response = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email, password: SEED_PASSWORD }).expect(200);
    return (response.headers['set-cookie'] as unknown as string[])
      .find((value) => value.startsWith(AUTH_COOKIE_NAME))!;
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK).useValue(clock).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    adminCookie = await login('admin@test.com');
    kitchenCookie = await login('kitchen@test.com');
    const employee = await prisma.customerEmployee.findUniqueOrThrow({
      where: { email: 'alice@northwind.com' }, include: { company: true },
    });
    employeeId = employee.id;
    const priceTierId = await app.get(PriceTierService).resolveEffectiveTierId(employee.company.priceTierId);
    const station = await prisma.kitchenStation.findFirstOrThrow({ where: { active: true } });
    dishId = (await prisma.dish.create({ data: {
      sku: `P04-${suffix}`, name: `P04 dish ${suffix}`, temperature: 'HOT',
      costCents: 700, kitchenStationId: station.id,
      tierPrices: { create: { priceTierId, priceCents: 2000 } },
    } })).id;
    categoryId = (await prisma.menuCategory.create({ data: {
      slug: `p04-${suffix}`, name: `P04 category ${suffix}`, dishes: { create: { dishId } },
    } })).id;
    groupId = (await prisma.optionGroup.create({ data: {
      code: `P04-${suffix}`, name: `P04 group ${suffix}`, required: true, maxSelections: 1,
      dishes: { create: { dishId } },
    } })).id;
    for (const index of [0, 1, 2]) {
      optionIds.push((await prisma.option.create({ data: {
        code: `P04-${suffix}-${index}`, name: `P04 choice ${index}`,
        tierPrices: { create: { priceTierId, priceCents: 100 * (index + 1) } },
        groups: { create: { optionGroupId: groupId } },
      } })).id);
    }
  }, 30_000);

  afterEach(() => clock.set(NOW));

  afterAll(async () => {
    if (prisma) {
      if (orderIds.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      if (categoryId) await prisma.menuCategory.delete({ where: { id: categoryId } });
      if (dishId) await prisma.dish.delete({ where: { id: dishId } });
      if (groupId) await prisma.optionGroup.delete({ where: { id: groupId } });
      if (optionIds.length) await prisma.option.deleteMany({ where: { id: { in: optionIds } } });
    }
    await app?.close();
  });

  const snapshot = (id: string) => prisma.order.findUniqueOrThrow({ where: { id }, include: {
    prepUnits: { orderBy: { id: 'asc' } },
    events: { orderBy: { occurredAt: 'asc' } },
    lines: { include: { combinations: { include: { options: true } } } },
  } });
  type Snapshot = Awaited<ReturnType<typeof snapshot>>;

  async function create(count = 2) {
    const response = await request(app.getHttpServer()).post('/api/orders').set('Cookie', adminCookie)
      .send({ customerEmployeeId: employeeId, deliveryDate: DATE, lines: [{
        dishId, categoryId, quantity: count,
        combinations: optionIds.slice(0, count).map((optionId) => ({ quantity: 1,
          selections: [{ optionGroupId: groupId, optionIds: [optionId] }],
        })),
      }] }).expect(201);
    const id = response.body.id as string;
    orderIds.push(id);
    // Fixture-only confirmation: do not alter shared cutoff runs/settings.
    await prisma.order.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: NOW } });
    const result = await snapshot(id);
    expect(result.prepUnits).toHaveLength(count);
    return result;
  }
  const start = (id: string) => request(app.getHttpServer()).post(`/api/kitchen/units/${id}/start`).set('Cookie', kitchenCookie);
  const done = (id: string) => request(app.getHttpServer()).post(`/api/kitchen/units/${id}/done`).set('Cookie', kitchenCookie);
  const force = (id: string) => request(app.getHttpServer()).post(`/api/kitchen/orders/${id}/force-complete`).set('Cookie', adminCookie);

  function assertUnchangedOrderData(before: Snapshot, after: Snapshot) {
    expect(after.version).toBe(before.version);
    expect(after.totalCents).toBe(before.totalCents);
    expect(after.subtotalCents).toBe(before.subtotalCents);
    expect(after.lines).toEqual(before.lines);
    expect(after.kitchenReadyAt).toEqual(before.kitchenReadyAt);
    expect(after.dispatchReadyAt).toEqual(before.dispatchReadyAt);
    expect(after.deliveryDate).toEqual(before.deliveryDate);
    expect(after.deliveryTime).toEqual(before.deliveryTime);
    expect(after.prepUnits.map((unit) => [unit.id, unit.orderCombinationId, unit.quantity, unit.kitchenStationId, unit.kitchenStationCode]))
      .toEqual(before.prepUnits.map((unit) => [unit.id, unit.orderCombinationId, unit.quantity, unit.kitchenStationId, unit.kitchenStationCode]));
  }
  function assertAggregate(order: Snapshot, remaining: number) {
    expect(order.prepUnits.filter((unit) => unit.status !== 'READY')).toHaveLength(remaining);
    expect(order.status).toBe(remaining === 0 ? 'READY' : 'IN_KITCHEN');
    expect(order.kitchenStartedAt).toBeTruthy();
    expect(order.events.filter((event) => event.type === 'KITCHEN_STARTED')).toHaveLength(1);
    expect(order.events.filter((event) => event.type === 'KITCHEN_READY')).toHaveLength(remaining === 0 ? 1 : 0);
    for (const unit of order.prepUnits.filter((unit) => unit.status === 'READY')) {
      expect(unit.startedAt).toBeTruthy();
      expect(unit.completedAt).toBeTruthy();
      expect(unit.completedAt!.getTime()).toBeGreaterThanOrEqual(unit.startedAt!.getTime());
    }
  }
  function assertOneTransition(results: { status: number; body: { code?: string } }[], code: string) {
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(results.find((result) => result.status === 409)?.body.code).toBe(code);
  }

  it('completes the same non-final unit once with valid timestamps and no duplicate events', async () => {
    const before = await create();
    const id = before.prepUnits[0]!.id;
    assertOneTransition(await Promise.all([done(id), done(id)]), 'PREP_UNIT_ALREADY_DONE');
    const after = await snapshot(before.id);
    assertAggregate(after, 1);
    expect(after.prepUnits.find((unit) => unit.id === id)).toMatchObject({ status: 'READY', startedAt: NOW, completedAt: NOW });
    assertUnchangedOrderData(before, after);
  });

  it('starts the same unit once and retains a single valid start timestamp', async () => {
    const before = await create();
    const id = before.prepUnits[0]!.id;
    assertOneTransition(await Promise.all([start(id), start(id)]), 'PREP_UNIT_ALREADY_STARTED');
    const after = await snapshot(before.id);
    assertAggregate(after, 2);
    expect(after.prepUnits.find((unit) => unit.id === id)).toMatchObject({ status: 'IN_PROGRESS', startedAt: NOW, completedAt: null });
    assertUnchangedOrderData(before, after);
  });

  it('completes an unstarted unit, populates start time, and does not become ready early', async () => {
    const before = await create();
    await done(before.prepUnits[0]!.id).expect(201);
    const after = await snapshot(before.id);
    assertAggregate(after, 1);
    expect(after.prepUnits.filter((unit) => unit.status === 'READY')[0]).toMatchObject({ startedAt: NOW, completedAt: NOW });
    assertUnchangedOrderData(before, after);
  });

  it('completes the final unit once and emits exactly one aggregate-ready event', async () => {
    const before = await create();
    await done(before.prepUnits[0]!.id).expect(201);
    const first = await snapshot(before.id);
    clock.set(new Date(NOW.getTime() + 60_000));
    const id = before.prepUnits[1]!.id;
    // The existing contract checks READY order eligibility before unit status.
    assertOneTransition(await Promise.all([done(id), done(id)]), 'KITCHEN_ORDER_NOT_WORKABLE');
    const after = await snapshot(before.id);
    assertAggregate(after, 0);
    expect(after.prepUnits[0]).toEqual(first.prepUnits[0]);
    expect(after.kitchenStartedAt).toEqual(first.kitchenStartedAt);
    expect(after.events.find((event) => event.type === 'KITCHEN_READY')?.occurredAt).toEqual(clock.now());
    assertUnchangedOrderData(before, after);
  });

  it('completes three different units concurrently without losing aggregate readiness', async () => {
    const before = await create(3);
    // Establish the start first so incidental first-start Order writes cannot
    // accidentally serialize the old aggregate-count race.
    await start(before.prepUnits[0]!.id).expect(201);
    const started = await snapshot(before.id);
    const results = await Promise.all(before.prepUnits.map((unit) => done(unit.id)));
    expect(results.map((result) => result.status)).toEqual([201, 201, 201]);
    const after = await snapshot(before.id);
    assertAggregate(after, 0);
    expect(after.kitchenStartedAt).toEqual(started.kitchenStartedAt);
    assertUnchangedOrderData(before, after);
  });

  it('starts distinct units concurrently without duplicating order-start side effects', async () => {
    const before = await create(3);
    const results = await Promise.all(before.prepUnits.map((unit) => start(unit.id)));
    expect(results.map((result) => result.status)).toEqual([201, 201, 201]);
    const after = await snapshot(before.id);
    assertAggregate(after, 3);
    expect(after.prepUnits.every((unit) => unit.status === 'IN_PROGRESS' && unit.startedAt?.getTime() === NOW.getTime())).toBe(true);
    assertUnchangedOrderData(before, after);
  });

  it('races completion against force-complete without deadlock, duplicated events or timestamp replacement', async () => {
    const before = await create(3);
    await done(before.prepUnits[0]!.id).expect(201);
    const first = await snapshot(before.id);
    clock.set(new Date(NOW.getTime() + 60_000));
    const [normal, forced] = await Promise.all([done(before.prepUnits[1]!.id), force(before.id)]);
    expect(forced.status).toBe(201);
    expect([201, 409]).toContain(normal.status);
    if (normal.status === 409) expect(normal.body.code).toBe('KITCHEN_ORDER_NOT_WORKABLE');
    const after = await snapshot(before.id);
    assertAggregate(after, 0);
    expect(after.prepUnits[0]).toEqual(first.prepUnits[0]);
    expect(after.kitchenStartedAt).toEqual(first.kitchenStartedAt);
    assertUnchangedOrderData(before, after);
  });

  it('races start against force-complete using the same parent-before-child lock order', async () => {
    const before = await create(3);
    const [normal, forced] = await Promise.all([start(before.prepUnits[0]!.id), force(before.id)]);
    expect(forced.status).toBe(201);
    expect([201, 409]).toContain(normal.status);
    if (normal.status === 409) expect(normal.body.code).toBe('KITCHEN_ORDER_NOT_WORKABLE');
    const after = await snapshot(before.id);
    assertAggregate(after, 0);
    assertUnchangedOrderData(before, after);
  });

  it('keeps concurrent and repeated force-complete idempotent', async () => {
    const before = await create(3);
    const results = await Promise.all([force(before.id), force(before.id)]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    const first = await snapshot(before.id);
    assertAggregate(first, 0);
    clock.set(new Date(NOW.getTime() + 60_000));
    await force(before.id).expect(201);
    const after = await snapshot(before.id);
    expect(after.prepUnits).toEqual(first.prepUnits);
    expect(after.events).toEqual(first.events);
    expect(after.kitchenStartedAt).toEqual(first.kitchenStartedAt);
    assertUnchangedOrderData(before, after);
  });

  it('rejects an already-completed unit and leaves persisted state unchanged', async () => {
    const before = await create();
    const id = before.prepUnits[0]!.id;
    await done(id).expect(201);
    const completed = await snapshot(before.id);
    clock.set(new Date(NOW.getTime() + 60_000));
    await done(id).expect(409).expect(({ body }) => expect(body.code).toBe('PREP_UNIT_ALREADY_DONE'));
    expect(await snapshot(before.id)).toEqual(completed);
  });

  it('preserves the start timestamp when a started unit completes later', async () => {
    const before = await create(1);
    const id = before.prepUnits[0]!.id;
    await start(id).expect(201);
    clock.set(new Date(NOW.getTime() + 60_000));
    await done(id).expect(201);
    const after = await snapshot(before.id);
    assertAggregate(after, 0);
    expect(after.prepUnits[0]).toMatchObject({ startedAt: NOW, completedAt: clock.now() });
    expect(after.kitchenStartedAt).toEqual(NOW);
    assertUnchangedOrderData(before, after);
  });

  it('races start against completion without overwriting the completed state', async () => {
    const before = await create();
    const id = before.prepUnits[0]!.id;
    const [started, completed] = await Promise.all([start(id), done(id)]);
    expect(completed.status).toBe(201);
    expect([201, 409]).toContain(started.status);
    if (started.status === 409) expect(started.body.code).toBe('PREP_UNIT_ALREADY_STARTED');
    const after = await snapshot(before.id);
    assertAggregate(after, 1);
    expect(after.prepUnits.find((unit) => unit.id === id)).toMatchObject({ status: 'READY', startedAt: NOW, completedAt: NOW });
    assertUnchangedOrderData(before, after);
  });

  it('rolls back unit timestamps and order state if a later event insertion fails', async () => {
    const before = await create();
    type Result = Awaited<ReturnType<KitchenBoardService['done']>>;
    const failingPrisma = {
      $transaction: (run: (tx: Prisma.TransactionClient) => Promise<Result>) =>
        prisma.$transaction(async (tx) => {
          const events = new Proxy(tx.orderEvent, { get(target, property) {
            if (property === 'create') return () => target.create({ data: {
              orderId: before.id, type: 'KITCHEN_STARTED', actorType: 'SYSTEM',
              // Real FK failure after the real unit and order updates.
              actorUserId: randomUUID(),
            } });
            return Reflect.get(target, property);
          } });
          return run(new Proxy(tx, { get(target, property) {
            return property === 'orderEvent' ? events : Reflect.get(target, property);
          } }));
        }),
    };
    const service = new KitchenBoardService(failingPrisma as unknown as PrismaService, app.get(KitchenTime));
    await expect(service.done(before.prepUnits[0]!.id)).rejects.toThrow();
    expect(await snapshot(before.id)).toEqual(before);
    await done(before.prepUnits[0]!.id).expect(201);
    assertAggregate(await snapshot(before.id), 1);
  });

  it('holds the actual aggregate lock through the count while other units compete', async () => {
    const before = await create(3);
    await start(before.prepUnits[0]!.id).expect(201);
    type Result = Awaited<ReturnType<KitchenBoardService['done']>>;
    let signalCount = () => {};
    let release = () => {};
    const atCount = new Promise<void>((resolve) => { signalCount = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pausedPrisma = {
      $transaction: (run: (tx: Prisma.TransactionClient) => Promise<Result>) =>
        prisma.$transaction(async (tx) => {
          const units = new Proxy(tx.prepUnit, { get(target, property) {
            if (property === 'count') return async (args: Prisma.PrepUnitCountArgs) => {
              signalCount();
              await gate;
              return target.count(args);
            };
            return Reflect.get(target, property);
          } });
          return run(new Proxy(tx, { get(target, property) {
            return property === 'prepUnit' ? units : Reflect.get(target, property);
          } }));
        }, { timeout: 15_000 }),
    };
    const running = new KitchenBoardService(pausedPrisma as unknown as PrismaService, app.get(KitchenTime))
      .done(before.prepUnits[1]!.id);
    try {
      await Promise.race([atCount, running.then(() => { throw new Error('Completion skipped aggregate count'); })]);
      // Probe from another real transaction. The old implementation has no
      // Order lock here once the order already has a kitchen start time.
      await expect(prisma.$transaction((tx) => tx.$queryRaw`
        SELECT id FROM "Order" WHERE id = ${before.id} FOR UPDATE NOWAIT
      `)).rejects.toThrow(/55P03|could not obtain lock/i);
      const competing = Promise.all([done(before.prepUnits[0]!.id), done(before.prepUnits[2]!.id)]);
      release();
      const [, results] = await Promise.all([running, competing]);
      expect(results.map((result) => result.status)).toEqual([201, 201]);
      const after = await snapshot(before.id);
      assertAggregate(after, 0);
      assertUnchangedOrderData(before, after);
    } finally {
      release();
      await running.catch(() => undefined);
    }
  }, 20_000);
});
