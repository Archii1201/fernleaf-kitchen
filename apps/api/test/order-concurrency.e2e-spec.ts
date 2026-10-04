import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { vi } from 'vitest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { CLOCK, FixedClock } from '../src/kitchen/time/clock.js';
import { KitchenTime } from '../src/kitchen/time/kitchen-time.js';
import { CutoffService } from '../src/kitchen/cutoff/cutoff.service.js';
import { CutoffProcessingService, type CutoffProcessResult } from '../src/kitchen/cutoff/cutoff-processing.service.js';
import { OrderBuilder } from '../src/orders/domain/order-builder.js';
import { OrderRepository } from '../src/orders/order.repository.js';
import { PriceTierService } from '../src/pricing/price-tier.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('P0-3 atomic order mutations (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repository: OrderRepository;
  const clock = new FixedClock(new Date('2031-03-01T04:00:00Z'));
  let cookie: string;
  let employeeId: string;
  let dishId: string;
  let categoryId: string;
  let groupId: string;
  const optionIds: string[] = [];
  const orderIds: string[] = [];
  const cutoffRunIds: string[] = [];
  const dropIds: string[] = [];
  const suffix = randomUUID();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK).useValue(clock).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    repository = app.get(OrderRepository);
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'admin@test.com', password: SEED_PASSWORD }).expect(200);
    cookie = (login.headers['set-cookie'] as unknown as string[])
      .find((value) => value.startsWith(AUTH_COOKIE_NAME))!;
    const employee = await prisma.customerEmployee.findUniqueOrThrow({
      where: { email: 'alice@northwind.com' }, include: { company: true },
    });
    employeeId = employee.id;
    const tierId = await app.get(PriceTierService).resolveEffectiveTierId(employee.company.priceTierId);
    const station = await prisma.kitchenStation.findFirstOrThrow({ where: { active: true } });
    dishId = (await prisma.dish.create({ data: {
      sku: `P03-${suffix}`, name: `P03 dish ${suffix}`, temperature: 'HOT',
      costCents: 700, kitchenStationId: station.id,
      tierPrices: { create: { priceTierId: tierId, priceCents: 2000 } },
    } })).id;
    categoryId = (await prisma.menuCategory.create({ data: {
      slug: `p03-${suffix}`, name: `P03 category ${suffix}`, dishes: { create: { dishId } },
    } })).id;
    groupId = (await prisma.optionGroup.create({ data: {
      code: `P03-${suffix}`, name: `P03 group ${suffix}`, required: true, maxSelections: 1,
      dishes: { create: { dishId } },
    } })).id;
    for (const [index, priceCents] of [100, 200].entries()) {
      optionIds.push((await prisma.option.create({ data: {
        code: `P03-${suffix}-${index}`, name: `P03 choice ${index}`,
        tierPrices: { create: { priceTierId: tierId, priceCents } },
        groups: { create: { optionGroupId: groupId } },
      } })).id);
    }
  }, 30_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (prisma) {
      if (orderIds.length) await prisma.dropOrder.deleteMany({ where: { orderId: { in: orderIds } } });
      if (orderIds.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      if (dropIds.length) await prisma.drop.deleteMany({ where: { id: { in: dropIds } } });
      if (cutoffRunIds.length) await prisma.cutoffRun.deleteMany({ where: { id: { in: cutoffRunIds } } });
      if (categoryId) await prisma.menuCategory.delete({ where: { id: categoryId } });
      if (dishId) await prisma.dish.delete({ where: { id: dishId } });
      if (groupId) await prisma.optionGroup.delete({ where: { id: groupId } });
      if (optionIds.length) await prisma.option.deleteMany({ where: { id: { in: optionIds } } });
    }
    await app?.close();
  });

  const combo = (quantity: number, index = 0) => ({ quantity,
    selections: [{ optionGroupId: groupId, optionIds: [optionIds[index]!] }],
  });
  const line = (quantity: number, combinations = [combo(quantity)]) => ({
    dishId, categoryId, quantity, combinations,
  });
  const payload = (input = line(1), deliveryTime = '12:30') => ({
    customerEmployeeId: employeeId, deliveryDate: '2031-03-05', deliveryTime, lines: [input],
  });
  async function create() {
    const result = await request(app.getHttpServer()).post('/api/orders')
      .set('Cookie', cookie).send(payload()).expect(201);
    orderIds.push(result.body.id);
    return { id: result.body.id as string, version: result.body.version as number };
  }
  const edit = (id: string, version: number, input: ReturnType<typeof line>) =>
    request(app.getHttpServer()).put(`/api/orders/${id}/lines`)
      .set('Cookie', cookie).send({ version, lines: [input] });

  function assertOneWinner(results: { status: number; body: { code?: string } }[], status = 200) {
    expect(results.map((r) => r.status).sort()).toEqual([status, 409].sort());
    expect(results.find((r) => r.status === 409)?.body.code).toBe('ORDER_VERSION_CONFLICT');
    return results.findIndex((r) => r.status === status);
  }
  async function assertConsistent(id: string) {
    const result = await repository.findById(id);
    const total = result.lines.reduce((sum, current) => {
      expect(current.quantity).toBe(current.combinations.reduce((s, c) => s + c.quantity, 0));
      expect(current.lineTotalCents).toBe(current.combinations.reduce((s, c) => s + c.totalCents, 0));
      for (const c of current.combinations) {
        expect(c.quantity).toBeGreaterThan(0);
        expect(c.totalCents).toBe(c.quantity * c.unitPriceCents);
        expect(c.optionsPriceCents).toBe(c.options.reduce((s, o) => s + o.optionPriceCents, 0));
        expect(c.prepUnit?.quantity).toBe(c.quantity);
      }
      return sum + current.lineTotalCents;
    }, 0);
    expect(result.subtotalCents).toBe(total);
    expect(result.totalCents).toBe(total);
    expect(result.prepUnits).toHaveLength(result.lines.reduce((s, l) => s + l.combinations.length, 0));
    return result;
  }

  // Synchronize only the preflight reads. Both requests still execute their
  // real HTTP handlers, transactions, SQL locks and writes concurrently.
  async function withSameHeader<T>(id: string, run: () => Promise<T>): Promise<T> {
    const original = repository.findHeader.bind(repository);
    let arrived = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const spy = vi.spyOn(repository, 'findHeader').mockImplementation(async (orderId) => {
      const result = await original(orderId);
      if (orderId === id) {
        arrived += 1;
        if (arrived === 2) release();
        await gate;
      }
      return result;
    });
    try { return await run(); } finally { release(); spy.mockRestore(); }
  }

  it('allows exactly one same-version monetary line edit, with no lost update', async () => {
    const order = await create();
    const results = await Promise.all([
      edit(order.id, order.version, line(2)), edit(order.id, order.version, line(3)),
    ]);
    const winner = assertOneWinner(results);
    const stored = await assertConsistent(order.id);
    expect(stored.version).toBe(order.version + 1);
    expect(stored.lines[0]!.quantity).toBe(winner === 0 ? 2 : 3);
    expect(stored.totalCents).toBe(winner === 0 ? 4200 : 6300);
  });

  it('rejects stale edits without changing snapshots, quantities, totals or version', async () => {
    const order = await create();
    await edit(order.id, order.version, line(2)).expect(200);
    const before = await repository.findById(order.id);
    await edit(order.id, order.version, line(7)).expect(409)
      .expect(({ body }) => expect(body.code).toBe('ORDER_VERSION_CONFLICT'));
    expect(await repository.findById(order.id)).toEqual(before);
  });

  it('allows exactly one competing combination split and retains its complete quantities', async () => {
    const order = await create();
    const results = await Promise.all([
      edit(order.id, order.version, line(5, [combo(2), combo(3, 1)])),
      edit(order.id, order.version, line(5, [combo(4), combo(1, 1)])),
    ]);
    const winner = assertOneWinner(results);
    const stored = await assertConsistent(order.id);
    expect(stored.version).toBe(order.version + 1);
    expect(stored.totalCents).toBe(winner === 0 ? 10800 : 10600);
    expect(stored.lines[0]!.combinations.map((c) => c.quantity).sort()).toEqual(winner === 0 ? [2, 3] : [1, 4]);
  });

  it('makes full replacement plus delivery/header writes one same-version transaction', async () => {
    const order = await create();
    const results = await Promise.all([
      request(app.getHttpServer()).put(`/api/orders/${order.id}`).set('Cookie', cookie)
        .send({ ...payload(line(2), '11:30'), version: order.version }),
      request(app.getHttpServer()).put(`/api/orders/${order.id}`).set('Cookie', cookie)
        .send({ ...payload(line(3), '13:30'), version: order.version }),
    ]);
    const winner = assertOneWinner(results);
    const stored = await assertConsistent(order.id);
    expect(stored.version).toBe(order.version + 1);
    expect(stored.totalCents).toBe(winner === 0 ? 4200 : 6300);
    const response = await request(app.getHttpServer()).get(`/api/orders/${order.id}`).set('Cookie', cookie).expect(200);
    expect(response.body.delivery.time).toBe(winner === 0 ? '11:30' : '13:30');
    const before = await repository.findById(order.id);
    await request(app.getHttpServer()).put(`/api/orders/${order.id}`).set('Cookie', cookie)
      .send({ ...payload(line(8), '15:30'), version: order.version }).expect(409);
    expect(await repository.findById(order.id)).toEqual(before);
  });

  it('also protects the existing optional-version full-update path', async () => {
    const order = await create();
    const results = await withSameHeader(order.id, () => Promise.all([
      request(app.getHttpServer()).put(`/api/orders/${order.id}`).set('Cookie', cookie).send(payload(line(2))),
      request(app.getHttpServer()).put(`/api/orders/${order.id}`).set('Cookie', cookie).send(payload(line(3))),
    ]));
    const winner = assertOneWinner(results);
    const stored = await assertConsistent(order.id);
    expect(stored.version).toBe(order.version + 1);
    expect(stored.totalCents).toBe(winner === 0 ? 4200 : 6300);
  });

  it('serializes full replacement against a line diff on the same version', async () => {
    const order = await create();
    const results = await Promise.all([
      request(app.getHttpServer()).put(`/api/orders/${order.id}`).set('Cookie', cookie)
        .send({ ...payload(line(2), '11:30'), version: order.version }),
      edit(order.id, order.version, line(3)),
    ]);
    const winner = assertOneWinner(results);
    const stored = await assertConsistent(order.id);
    expect(stored.version).toBe(order.version + 1);
    expect(stored.totalCents).toBe(winner === 0 ? 4200 : 6300);
  });

  it.each(['lines', 'full'] as const)('serializes cancellation against a %s edit from the same header', async (mode) => {
    const order = await create();
    const results = await withSameHeader(order.id, () => Promise.all([
      request(app.getHttpServer()).post(`/api/orders/${order.id}/cancel`).set('Cookie', cookie),
      mode === 'lines' ? edit(order.id, order.version, line(3)) :
        request(app.getHttpServer()).put(`/api/orders/${order.id}`).set('Cookie', cookie)
          .send({ ...payload(line(3)), version: order.version }),
    ]));
    expect(results.filter((r) => r.status < 300)).toHaveLength(1);
    expect(results.find((r) => r.status === 409)?.body.code).toBe('ORDER_VERSION_CONFLICT');
    const stored = await assertConsistent(order.id);
    expect(stored.version).toBe(order.version + 1);
    const cancelled = results[0]!.status === 201;
    expect(stored.status).toBe(cancelled ? 'CANCELLED' : 'DRAFT');
    expect(stored.totalCents).toBe(cancelled ? 2100 : 6300);
    expect(stored.events.filter((e) => e.type === 'CANCELLED')).toHaveLength(cancelled ? 1 : 0);
  });

  it.each(['place', 'cancel', 'reject'] as const)('does not duplicate concurrent %s transitions or events', async (action) => {
    const order = await create();
    if (action === 'reject') await request(app.getHttpServer()).post(`/api/orders/${order.id}/place`).set('Cookie', cookie).expect(201);
    const before = await repository.findHeader(order.id);
    const results = await withSameHeader(order.id, () => Promise.all([0, 1].map(() =>
      request(app.getHttpServer()).post(`/api/orders/${order.id}/${action}`).set('Cookie', cookie).send({ reason: 'P03 rejection' }),
    )));
    assertOneWinner(results, 201);
    const stored = await assertConsistent(order.id);
    const type = action === 'place' ? 'PLACED' : action === 'cancel' ? 'CANCELLED' : 'REJECTED';
    expect(stored.status).toBe(type);
    expect(stored.version).toBe(before.version + 1);
    expect(stored.events.filter((e) => e.type === type)).toHaveLength(1);
  });

  it('keeps the already-atomic admin override path protected against concurrent same-version edits', async () => {
    const order = await create();
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
    const results = await Promise.all(['11:30', '13:30'].map((deliveryTime) =>
      request(app.getHttpServer()).put(`/api/orders/${order.id}/admin/delivery-time`)
        .set('Cookie', cookie).send({ version: order.version, deliveryTime }),
    ));
    const winner = assertOneWinner(results);
    const stored = await assertConsistent(order.id);
    expect(stored.version).toBe(order.version + 1);
    expect(stored.totalCents).toBe(2100);
    const response = await request(app.getHttpServer()).get(`/api/orders/${order.id}`).set('Cookie', cookie).expect(200);
    expect(response.body.delivery.time).toBe(winner === 0 ? '11:30' : '13:30');
  });

  it('does not overwrite the winning state when placement and cancellation compete', async () => {
    const order = await create();
    const results = await withSameHeader(order.id, () => Promise.all([
      request(app.getHttpServer()).post(`/api/orders/${order.id}/place`).set('Cookie', cookie),
      request(app.getHttpServer()).post(`/api/orders/${order.id}/cancel`).set('Cookie', cookie),
    ]));
    const winner = assertOneWinner(results, 201);
    const stored = await assertConsistent(order.id);
    expect(stored.version).toBe(order.version + 1);
    expect(stored.status).toBe(winner === 0 ? 'PLACED' : 'CANCELLED');
    expect(stored.events.filter((event) => event.type === 'PLACED')).toHaveLength(winner === 0 ? 1 : 0);
    expect(stored.events.filter((event) => event.type === 'CANCELLED')).toHaveLength(winner === 1 ? 1 : 0);
  });

  it('rolls back lines, prep units and version when the header write fails after replacement', async () => {
    const order = await create();
    const before = await repository.findById(order.id);
    const built = await app.get(OrderBuilder).build(payload(line(3)));
    await expect(repository.replaceAllLines(order.id, built.order.lines, order.version, {
      priceTier: { connect: { id: randomUUID() } }, customerNotes: 'Must roll back',
    })).rejects.toThrow();
    expect(await repository.findById(order.id)).toEqual(before);
  });

  it('rolls back state and version if writing the transition event fails', async () => {
    const order = await create();
    const before = await repository.findById(order.id);
    await expect(repository.transition(order.id, order.version, 'CANCELLED', { cancelledAt: new Date() }, {
      order: { connect: { id: order.id } }, type: 'CANCELLED', actorType: 'STAFF',
      actorUser: { connect: { id: randomUUID() } },
    })).rejects.toThrow();
    expect(await repository.findById(order.id)).toEqual(before);
  });

  it('rechecks terminal state under the line-diff lock even when the version is unchanged', async () => {
    const order = await create();
    const before = await repository.findById(order.id);
    const built = await app.get(OrderBuilder).build(payload(line(3)));
    const existing = repository.existingCombinations(before);
    // Cutoff/kitchen state writers need not change the edit version.
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    const cancelled = await repository.findById(order.id);
    await expect(repository.applyLineDiff({ orderId: order.id, expectedVersion: order.version,
      incoming: built.order, existing, diffs: [],
    })).rejects.toMatchObject({ code: 'ORDER_NOT_EDITABLE' });
    expect(await repository.findById(order.id)).toEqual(cancelled);
  });

  it('revalidates preparation status from locked data instead of trusting an earlier diff', async () => {
    const order = await create();
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
    const before = await repository.findById(order.id);
    const built = await app.get(OrderBuilder).build(payload(line(3)));
    const existing = repository.existingCombinations(before);
    await prisma.prepUnit.updateMany({ where: { orderId: order.id }, data: { status: 'IN_PROGRESS' } });
    const started = await repository.findById(order.id);
    await expect(repository.applyLineDiff({ orderId: order.id, expectedVersion: order.version,
      incoming: built.order, existing, diffs: [],
    })).rejects.toMatchObject({ code: 'PREP_UNIT_LOCKED' });
    expect(await repository.findById(order.id)).toEqual(started);
  });

  it('holds the real order lock during cutoff confirmation and rejects a competing cancellation', async () => {
    const date = new Date('2081-03-01T00:00:00Z');
    while (date.getUTCDay() !== 3) date.setUTCDate(date.getUTCDate() + 1);
    const deliveryDate = date.toISOString().slice(0, 10);
    const created = await request(app.getHttpServer()).post('/api/orders').set('Cookie', cookie)
      .send({ ...payload(), deliveryDate }).expect(201);
    const id = created.body.id as string;
    orderIds.push(id);
    await request(app.getHttpServer()).post(`/api/orders/${id}/place`).set('Cookie', cookie).expect(201);
    const cutoff = app.get(CutoffService);
    const resolved = await cutoff.resolve(deliveryDate);
    clock.set(new Date(resolved.cutoffAt.getTime() + 1));
    let signalRead = () => {};
    let release = () => {};
    const read = new Promise<void>((resolve) => { signalRead = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    // Pause after the real SQL candidate read. All locks and writes remain
    // real; a second connection probes the lock and sends the HTTP mutation.
    const pausedPrisma = {
      $transaction: (run: (tx: Prisma.TransactionClient) => Promise<CutoffProcessResult>) =>
        prisma.$transaction(async (tx) => {
          const orders = new Proxy(tx.order, { get(target, property) {
            if (property === 'findMany') return async (args: Prisma.OrderFindManyArgs) => {
              const rows = await target.findMany(args);
              signalRead();
              await gate;
              return rows;
            };
            return Reflect.get(target, property);
          } });
          return run(new Proxy(tx, { get(target, property) {
            return property === 'order' ? orders : Reflect.get(target, property);
          } }));
        }, { timeout: 15_000 }),
    };
    const processing = new CutoffProcessingService(pausedPrisma as unknown as PrismaService, cutoff, app.get(KitchenTime))
      .ensureProcessed(deliveryDate);
    try {
      await Promise.race([read, processing.then(() => { throw new Error('Processing skipped candidate read'); })]);
      await expect(prisma.$transaction((tx) => tx.$queryRaw`
        SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE NOWAIT
      `)).rejects.toThrow(/55P03|could not obtain lock/i);
      const cancellation = request(app.getHttpServer()).post(`/api/orders/${id}/cancel`)
        .set('Cookie', cookie).then((response) => response);
      release();
      const [result, cancelled] = await Promise.all([processing, cancellation]);
      expect(result.confirmed).toBe(1);
      expect(cancelled.status).toBe(409);
      expect(cancelled.body.code).toBe('INVALID_ORDER_TRANSITION');
      const stored = await assertConsistent(id);
      expect(stored.status).toBe('CONFIRMED');
      expect(stored.events.filter((event) => event.type === 'CONFIRMED')).toHaveLength(1);
      expect(stored.events.filter((event) => event.type === 'CANCELLED')).toHaveLength(0);
    } finally {
      release();
      await processing.catch(() => undefined);
      clock.set(new Date('2031-03-01T04:00:00Z'));
      const stored = await prisma.order.findUniqueOrThrow({ where: { id }, include: { dropOrder: true } });
      if (stored.cutoffRunId) cutoffRunIds.push(stored.cutoffRunId);
      if (stored.dropOrder) dropIds.push(stored.dropOrder.dropId);
    }
  }, 20_000);
});
