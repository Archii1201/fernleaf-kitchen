import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PAST = '2025-03-04';
const FUTURE = '2031-03-05';

describe('Cutoff processing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let driverCookie: string;
  let companyId: string;
  let employeeId: string;
  let addressId: string;
  let tierId: string;
  let createdOrderIds: string[] = [];

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: SEED_PASSWORD })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return cookies.find((cookie) => cookie.startsWith(AUTH_COOKIE_NAME))!;
  }

  async function insertOrder(status: 'DRAFT' | 'PLACED', suffix: string) {
    const order = await prisma.order.create({
      data: {
        orderNumber: `CUTOFF-${suffix}`,
        companyId,
        customerEmployeeId: employeeId,
        status,
        deliveryDate: new Date(`${PAST}T00:00:00.000Z`),
        deliveryTime: new Date('1970-01-01T12:30:00.000Z'),
        deliveryAddressId: addressId,
        deliveryAddressLabel: 'HQ',
        deliveryAddressLine1: '1 Road',
        deliveryAddressCity: 'Bengaluru',
        deliveryAddressPostalCode: '560025',
        deliveryAddressCountry: 'IN',
        priceTierId: tierId,
        priceTierName: 'Standard',
        leaveKitchenMinutes: 60,
        subtotalCents: 2099,
        totalCents: 2099,
      },
      select: { id: true },
    });
    createdOrderIds.push(order.id);
    return order.id;
  }

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
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { defaultAddressId: true, priceTierId: true },
    });
    addressId = company.defaultAddressId!;
    tierId = company.priceTierId!;
    employeeId = (
      await prisma.customerEmployee.findUniqueOrThrow({
        where: { email: 'alice@northwind.com' },
        select: { id: true },
      })
    ).id;

    const target = new Date(`${PAST}T00:00:00.000Z`);
    await prisma.dropOrder.deleteMany({
      where: { drop: { deliveryDate: target } },
    });
    await prisma.order.updateMany({
      where: { deliveryDate: target },
      data: { cutoffRunId: null },
    });
    await prisma.cutoffRun.deleteMany({ where: { targetDeliveryDate: target } });
    await prisma.drop.deleteMany({ where: { deliveryDate: target } });
  });

  afterAll(async () => {
    await prisma.dropOrder.deleteMany({
      where: { orderId: { in: createdOrderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.drop.deleteMany({
      where: { companyId, deliveryDate: new Date(`${PAST}T00:00:00.000Z`) },
    });
    await prisma.cutoffRun.deleteMany({
      where: { targetDeliveryDate: new Date(`${PAST}T00:00:00.000Z`) },
    });
    await app.close();
  });

  it('rejects callers without kitchen.update', async () => {
    await request(app.getHttpServer()).post(`/api/cutoff/process/${PAST}`).expect(401);
    await request(app.getHttpServer())
      .post(`/api/cutoff/process/${PAST}`)
      .set('Cookie', driverCookie)
      .expect(403);
  });

  it('skips a future cutoff and processes a past date idempotently', async () => {
    const draftId = await insertOrder('DRAFT', `D-${Date.now()}`);
    const placedId = await insertOrder('PLACED', `P-${Date.now()}`);

    await request(app.getHttpServer())
      .post(`/api/cutoff/process/${FUTURE}`)
      .set('Cookie', adminCookie)
      .expect(201)
      .expect(({ body }) => {
        expect(body.skipped).toBe(true);
        expect(body.reason).toBe('CUTOFF_NOT_PASSED');
      });

    const first = await request(app.getHttpServer())
      .post(`/api/cutoff/process/${PAST}`)
      .set('Cookie', adminCookie)
      .expect(201);

    expect(first.body.processed).toBe(true);
    expect(first.body.cancelled).toBeGreaterThanOrEqual(1);
    expect(first.body.confirmed).toBeGreaterThanOrEqual(1);
    expect(first.body.drops).toBeGreaterThanOrEqual(1);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: draftId } })).status).toBe(
      'CANCELLED',
    );
    expect((await prisma.order.findUniqueOrThrow({ where: { id: placedId } })).status).toBe(
      'CONFIRMED',
    );

    const second = await request(app.getHttpServer())
      .post(`/api/cutoff/process/${PAST}`)
      .set('Cookie', adminCookie)
      .expect(201);

    expect(second.body.alreadyProcessed).toBe(true);
    expect(await prisma.cutoffRun.count({
      where: { targetDeliveryDate: new Date(`${PAST}T00:00:00.000Z`) },
    })).toBe(1);
    expect(await prisma.orderEvent.count({
      where: { orderId: placedId, type: 'CONFIRMED' },
    })).toBe(1);
  });
});
