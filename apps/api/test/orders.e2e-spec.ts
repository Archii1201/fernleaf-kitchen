import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const WEDNESDAY = '2031-03-05';
const SATURDAY = '2031-03-08';

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let driverCookie: string;
  let employeeId: string;
  let companyId: string;
  let wrapId: string;
  let curryId: string;
  let specialId: string;
  let saladId: string;
  let createdIds: string[] = [];

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: SEED_PASSWORD })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return cookies.find((cookie) => cookie.startsWith(AUTH_COOKIE_NAME))!;
  }

  const wrapLine = (quantity = 1) => ({
    dishId: wrapId,
    quantity,
    combinations: [{ quantity, selections: [] }],
  });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    adminCookie = await login('admin@test.com');
    driverCookie = await login('driver@test.com');

    companyId = (
      await prisma.companyDomain.findUniqueOrThrow({
        where: { domain: 'northwind.com' },
        select: { companyId: true },
      })
    ).companyId;
    employeeId = (
      await prisma.customerEmployee.findUniqueOrThrow({
        where: { email: 'alice@northwind.com' },
        select: { id: true },
      })
    ).id;
    wrapId = (
      await prisma.dish.findUniqueOrThrow({
        where: { sku: 'FK-WRAP-001' },
        select: { id: true },
      })
    ).id;
    curryId = (
      await prisma.dish.findUniqueOrThrow({
        where: { sku: 'FK-CURRY-001' },
        select: { id: true },
      })
    ).id;
    specialId = (
      await prisma.dish.findUniqueOrThrow({
        where: { sku: 'FK-SPECIAL-001' },
        select: { id: true },
      })
    ).id;
    saladId = (
      await prisma.dish.findUniqueOrThrow({
        where: { sku: 'FK-SALAD-001' },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.order.deleteMany({ where: { id: { in: createdIds } } });
    }
    await prisma.companyHoliday.deleteMany({
      where: { companyId, date: new Date('2031-03-12T00:00:00Z') },
    });
    await prisma.companyHiddenDish.deleteMany({
      where: { companyId, dishId: saladId },
    });
    await app.close();
  });

  it('rejects anonymous and unauthorized callers', async () => {
    await request(app.getHttpServer()).get('/api/orders').expect(401);
    await request(app.getHttpServer())
      .get('/api/orders')
      .set('Cookie', driverCookie)
      .expect(403);
  });

  it('quotes and creates a valid wrap order with snapshots and prep units', async () => {
    const payload = {
      customerEmployeeId: employeeId,
      deliveryDate: WEDNESDAY,
      lines: [wrapLine(2)],
    };

    const quote = await request(app.getHttpServer())
      .post('/api/orders/quote')
      .set('Cookie', adminCookie)
      .send(payload)
      .expect(201);

    expect(quote.body.persisted).toBe(false);
    expect(quote.body.totalCents).toBe(4_198);
    expect(quote.body.priceTier.name).toBe('Standard');
    expect(quote.body.cutoff.hasPassed).toBe(false);

    const created = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', adminCookie)
      .send(payload)
      .expect(201);

    createdIds.push(created.body.id);
    expect(created.body.status).toBe('DRAFT');
    expect(created.body.totalCents).toBe(4_198);
    expect(created.body.delivery.leaveKitchenMinutes).toBe(60);
    expect(created.body.lines[0].sku).toBe('FK-WRAP-001');
    expect(created.body.lines[0].kitchenStation.code).toBe('HOT_LINE');
    expect(created.body.prepUnits).toHaveLength(1);
    expect(created.body.events[0].type).toBe('DRAFT');

    const listed = await request(app.getHttpServer())
      .get(`/api/orders?companyId=${companyId}&search=FK-`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(listed.body.data.some((row: { id: string }) => row.id === created.body.id)).toBe(
      true,
    );
  });

  it('rejects an unknown employee, hidden dish, missing price, MOQ and quantity mismatch', async () => {
    await request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', adminCookie)
      .send({
        customerEmployeeId: '00000000-0000-4000-8000-000000000001',
        deliveryDate: WEDNESDAY,
        lines: [wrapLine()],
      })
      .expect(404);

    await prisma.companyHiddenDish.create({
      data: { companyId, dishId: saladId },
    });
    await request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', adminCookie)
      .send({
        customerEmployeeId: employeeId,
        deliveryDate: WEDNESDAY,
        lines: [
          {
            dishId: saladId,
            quantity: 1,
            combinations: [{ quantity: 1, selections: [] }],
          },
        ],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('DISH_NOT_ORDERABLE');
      });
    await prisma.companyHiddenDish.deleteMany({
      where: { companyId, dishId: saladId },
    });

    await request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', adminCookie)
      .send({
        customerEmployeeId: employeeId,
        deliveryDate: WEDNESDAY,
        lines: [
          {
            dishId: specialId,
            quantity: 1,
            combinations: [{ quantity: 1, selections: [] }],
          },
        ],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('DISH_NOT_ORDERABLE');
      });

    await request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', adminCookie)
      .send({
        customerEmployeeId: employeeId,
        deliveryDate: WEDNESDAY,
        lines: [
          {
            dishId: curryId,
            quantity: 1,
            combinations: [{ quantity: 1, selections: [] }],
          },
        ],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('MINIMUM_ORDER_QUANTITY_NOT_MET');
      });

    await request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', adminCookie)
      .send({
        customerEmployeeId: employeeId,
        deliveryDate: WEDNESDAY,
        lines: [
          {
            dishId: wrapId,
            quantity: 2,
            combinations: [{ quantity: 1, selections: [] }],
          },
        ],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('COMBINATION_QUANTITY_MISMATCH');
      });
  });

  it('rejects a Saturday and a company holiday', async () => {
    await request(app.getHttpServer())
      .post('/api/orders/quote')
      .set('Cookie', adminCookie)
      .send({
        customerEmployeeId: employeeId,
        deliveryDate: SATURDAY,
        lines: [wrapLine()],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('DELIVERY_NOT_ALLOWED');
      });

    await prisma.companyHoliday.create({
      data: {
        companyId,
        date: new Date('2031-03-12T00:00:00Z'),
        name: 'E2E closed',
      },
    });

    await request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', adminCookie)
      .send({
        customerEmployeeId: employeeId,
        deliveryDate: '2031-03-12',
        lines: [wrapLine()],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('DELIVERY_NOT_ALLOWED');
      });

    await prisma.companyHoliday.deleteMany({
      where: { companyId, date: new Date('2031-03-12T00:00:00Z') },
    });
  });

  it('places, rejects stale line edits, preserves unchanged combos, and locks started prep', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', adminCookie)
      .send({
        customerEmployeeId: employeeId,
        deliveryDate: WEDNESDAY,
        lines: [wrapLine(1)],
      })
      .expect(201);
    createdIds.push(created.body.id);

    const comboId = created.body.lines[0].combinations[0].id;

    const same = await request(app.getHttpServer())
      .put(`/api/orders/${created.body.id}/lines`)
      .set('Cookie', adminCookie)
      .send({
        version: created.body.version,
        lines: [wrapLine(1)],
      })
      .expect(200);

    expect(same.body.lines[0].combinations[0].id).toBe(comboId);
    expect(same.body.version).toBe(created.body.version + 1);

    await request(app.getHttpServer())
      .put(`/api/orders/${created.body.id}/lines`)
      .set('Cookie', adminCookie)
      .send({
        version: created.body.version,
        lines: [wrapLine(2)],
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('ORDER_VERSION_CONFLICT');
      });

    const placed = await request(app.getHttpServer())
      .post(`/api/orders/${created.body.id}/place`)
      .set('Cookie', adminCookie)
      .expect(201);
    expect(placed.body.status).toBe('PLACED');

    await request(app.getHttpServer())
      .post(`/api/orders/${created.body.id}/place`)
      .set('Cookie', adminCookie)
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_ORDER_TRANSITION');
      });

    await prisma.prepUnit.updateMany({
      where: { orderId: created.body.id },
      data: { status: 'IN_PROGRESS' },
    });

    await request(app.getHttpServer())
      .put(`/api/orders/${created.body.id}/lines`)
      .set('Cookie', adminCookie)
      .send({
        version: placed.body.version,
        lines: [wrapLine(2)],
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('PREP_UNIT_LOCKED');
      });
  });

  it('cancels a draft', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', adminCookie)
      .send({
        customerEmployeeId: employeeId,
        deliveryDate: WEDNESDAY,
        lines: [wrapLine()],
      })
      .expect(201);
    createdIds.push(created.body.id);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/orders/${created.body.id}/cancel`)
      .set('Cookie', adminCookie)
      .expect(201);

    expect(cancelled.body.status).toBe('CANCELLED');
  });
});
