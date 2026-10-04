import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { PriceTierService } from '../src/pricing/price-tier.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Order combinations through HTTP (P0-1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  let employeeId: string;
  let dishId: string;
  let categoryId: string;
  let tierId: string;
  let otherTierId: string;
  const groupIds: string[] = [];
  const optionIds: string[] = [];
  const orderIds: string[] = [];
  const suffix = randomUUID();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'admin@test.com', password: SEED_PASSWORD }).expect(200);
    cookie = (login.headers['set-cookie'] as unknown as string[])
      .find((value) => value.startsWith(AUTH_COOKIE_NAME))!;
    const employee = await prisma.customerEmployee.findUniqueOrThrow({
      where: { email: 'alice@northwind.com' }, include: { company: true },
    });
    employeeId = employee.id;
    tierId = await app.get(PriceTierService).resolveEffectiveTierId(employee.company.priceTierId);
    otherTierId = (await prisma.priceTier.create({ data: {
      code: `P01-DECOY-${suffix}`, name: `P01 decoy ${suffix}`, strategy: 'EXPLICIT',
    } })).id;
    const station = await prisma.kitchenStation.findFirstOrThrow({ where: { active: true } });
    const dish = await prisma.dish.create({ data: {
      sku: `P01-${suffix}`, name: `Combination test ${suffix}`, temperature: 'HOT',
      costCents: 700, kitchenStationId: station.id,
    } });
    dishId = dish.id;
    categoryId = (await prisma.menuCategory.create({ data: {
      slug: `p01-${suffix}`, name: `P01 ${suffix}`,
      dishes: { create: { dishId } },
    } })).id;
    await prisma.dishTierPrice.create({ data: { dishId, priceTierId: tierId, priceCents: 2000 } });
    for (const [index, required] of [true, false].entries()) {
      const group = await prisma.optionGroup.create({ data: {
        code: `P01-${suffix}-${index}`, name: `P01 group ${suffix} ${index}`,
        required, maxSelections: required ? 1 : 2,
        dishes: { create: { dishId } },
      } });
      groupIds.push(group.id);
    }
    for (const [index, price] of [100, 200, 100, 100, 500].entries()) {
      const option = await prisma.option.create({ data: {
        code: `P01-${suffix}-${index}`, name: `Choice ${index}`, active: index !== 2,
        tierPrices: { create: [
          { priceTierId: tierId, priceCents: price },
          { priceTierId: otherTierId, priceCents: 9999 },
        ] },
      } });
      optionIds.push(option.id);
      await prisma.optionGroupOption.create({ data: {
        optionGroupId: groupIds[index === 4 ? 1 : 0]!, optionId: option.id,
        active: index !== 3,
      } });
    }
  }, 30_000);

  afterAll(async () => {
    if (prisma) {
      if (orderIds.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      if (categoryId) await prisma.menuCategory.delete({ where: { id: categoryId } });
      if (dishId) await prisma.dish.delete({ where: { id: dishId } });
      if (groupIds.length) await prisma.optionGroup.deleteMany({ where: { id: { in: groupIds } } });
      if (optionIds.length) await prisma.option.deleteMany({ where: { id: { in: optionIds } } });
      if (otherTierId) await prisma.priceTier.delete({ where: { id: otherTierId } });
    }
    await app?.close();
  });

  const selection = (optionIndex: number, groupIndex = 0) => ({
    optionGroupId: groupIds[groupIndex]!, optionIds: [optionIds[optionIndex]!],
  });
  const combo = (quantity: number, optionIndex: number) => ({ quantity, selections: [selection(optionIndex)] });
  const line = (quantity: number, combinations = [combo(quantity, 0)]) => ({
    dishId, categoryId, quantity, combinations, notes: 'Retain kitchen note',
  });
  const payload = (input = line(1)) => ({
    customerEmployeeId: employeeId, deliveryDate: '2031-03-05', lines: [input],
  });
  async function create(input = line(1)) {
    const result = await request(app.getHttpServer()).post('/api/orders')
      .set('Cookie', cookie).send(payload(input)).expect(201);
    orderIds.push(result.body.id);
    return result.body;
  }

  it('prices a required selection with the employee company tier and allows optional omission', async () => {
    const result = await create();
    expect(result.priceTier.id).toBe(tierId);
    expect(result.totalCents).toBe(2100);
    expect(result.lines[0].combinations[0].optionsPriceCents).toBe(100);
    expect(result.prepUnits).toHaveLength(1);
    expect(result.prepUnits[0].quantity).toBe(1);
  });

  it('prices optional selections through the same server formula', async () => {
    const result = await create(line(1, [{ quantity: 1, selections: [selection(0), selection(4, 1)] }]));
    expect(result.totalCents).toBe(2600);
    expect(result.lines[0].combinations[0].options).toHaveLength(2);
  });

  it('quotes, persists and edits independent splits with one prep unit per combination', async () => {
    const input = line(5, [combo(2, 0), combo(3, 1)]);
    const quote = await request(app.getHttpServer()).post('/api/orders/quote')
      .set('Cookie', cookie).send(payload(input)).expect(201);
    expect(quote.body.totalCents).toBe(10800);
    const result = await create(input);
    expect(result.totalCents).toBe(10800);
    expect(result.lines[0].lineTotalCents).toBe(10800);
    expect(result.lines[0].combinations.map((c: { totalCents: number }) => c.totalCents).sort((a: number, b: number) => a - b)).toEqual([4200, 6600]);
    expect(result.prepUnits).toHaveLength(2);
    expect(new Set(result.lines[0].combinations.map((c: { prepUnit: { id: string } }) => c.prepUnit.id)).size).toBe(2);
    for (const c of result.lines[0].combinations) {
      expect(c.prepUnit.quantity).toBe(c.quantity);
      expect(c.options).toHaveLength(1);
    }
    const edited = await request(app.getHttpServer()).put(`/api/orders/${result.id}/lines`)
      .set('Cookie', cookie).send({ version: result.version, lines: [line(5, [combo(1, 0), combo(4, 1)])] }).expect(200);
    expect(edited.body.version).toBe(result.version + 1);
    expect(edited.body.totalCents).toBe(10900);
    expect(edited.body.lines[0].notes).toBe('Retain kitchen note');
    expect(edited.body.prepUnits).toHaveLength(2);
    for (const c of edited.body.lines[0].combinations) expect(c.prepUnit.quantity).toBe(c.quantity);
  });

  it.each([
    ['required omitted', 'REQUIRED_OPTION_GROUP_MISSING', () => []],
    ['required empty', 'REQUIRED_OPTION_GROUP_MISSING', () => [{ optionGroupId: groupIds[0]!, optionIds: [] }]],
    ['wrong membership', 'OPTION_NOT_IN_GROUP', () => [selection(4)]],
    ['unknown option', 'OPTION_NOT_IN_GROUP', () => [{ optionGroupId: groupIds[0]!, optionIds: [randomUUID()] }]],
    ['inactive option', 'OPTION_UNAVAILABLE', () => [selection(2)]],
    ['inactive membership', 'OPTION_NOT_IN_GROUP', () => [selection(3)]],
    ['duplicate within group', 'DUPLICATE_OPTION_SELECTION', () => [{ optionGroupId: groupIds[0]!, optionIds: [optionIds[0]!, optionIds[0]!] }]],
    ['duplicate across entries', 'DUPLICATE_OPTION_SELECTION', () => [selection(0), selection(0)]],
    ['maximum across entries', 'MAX_SELECTIONS_EXCEEDED', () => [selection(0), selection(1)]],
  ] as const)('rejects %s on both quote and create', async (_name, code, selections) => {
    for (const path of ['/api/orders/quote', '/api/orders']) {
      await request(app.getHttpServer()).post(path).set('Cookie', cookie)
        .send(payload(line(1, [{ quantity: 1, selections: selections() }])))
        .expect(400).expect(({ body }) => expect(body.code).toBe(code));
    }
  });

  it.each([4, 6])('rejects split total %i for line quantity 5', async (total) => {
    await request(app.getHttpServer()).post('/api/orders').set('Cookie', cookie)
      .send(payload(line(5, [combo(2, 0), combo(total - 2, 1)]))).expect(400)
      .expect(({ body }) => expect(body.code).toBe('COMBINATION_QUANTITY_MISMATCH'));
  });

  it.each([0, -1, 1.5])('rejects nonpositive/noninteger combination quantity %s at HTTP boundary', async (quantity) => {
    await request(app.getHttpServer()).post('/api/orders').set('Cookie', cookie)
      .send(payload(line(1, [combo(quantity, 0)]))).expect(400);
  });

  it('rejects invalid selections on editing without altering persisted money or quantities', async () => {
    const result = await create();
    await request(app.getHttpServer()).put(`/api/orders/${result.id}/lines`)
      .set('Cookie', cookie).send({ version: result.version,
        lines: [line(1, [{ quantity: 1, selections: [selection(0), selection(0)] }])],
      }).expect(400).expect(({ body }) => expect(body.code).toBe('DUPLICATE_OPTION_SELECTION'));
    const fetched = await request(app.getHttpServer()).get(`/api/orders/${result.id}`)
      .set('Cookie', cookie).expect(200);
    expect(fetched.body.version).toBe(result.version);
    expect(fetched.body.totalCents).toBe(2100);
    expect(fetched.body.lines).toEqual(result.lines);
    expect(fetched.body.prepUnits).toEqual(result.prepUnits);
  });

  it('keeps historical dish, option and price snapshots stable after catalogue changes', async () => {
    const result = await create();
    await prisma.option.update({ where: { id: optionIds[0]! }, data: { name: 'Changed choice', active: false } });
    await prisma.dish.update({ where: { id: dishId }, data: { name: 'Changed dish' } });
    await prisma.optionTierPrice.updateMany({ where: { optionId: optionIds[0]!, priceTierId: tierId }, data: { priceCents: 999 } });
    await prisma.dishTierPrice.updateMany({ where: { dishId, priceTierId: tierId }, data: { priceCents: 9999 } });
    const fetched = await request(app.getHttpServer()).get(`/api/orders/${result.id}`)
      .set('Cookie', cookie).expect(200);
    expect(fetched.body.lines).toEqual(result.lines);
    expect(fetched.body.totalCents).toBe(2100);
  });
});
