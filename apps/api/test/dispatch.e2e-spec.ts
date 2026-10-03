import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { KitchenTime } from '../src/kitchen/time/kitchen-time.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const DATE = '2026-02-10';

describe('Dispatch (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let kitchenTime: KitchenTime;
  let adminCookie: string;
  let dispatchCookie: string;
  let kitchenCookie: string;
  let driverCookie: string;
  let companyId: string;
  let employeeId: string;
  let addressId: string;
  let tierId: string;
  let driverStaffId: string;
  let kitchenStaffId: string;
  let orderId: string;
  let dropId: string;

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: SEED_PASSWORD })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return cookies.find((cookie) => cookie.startsWith(AUTH_COOKIE_NAME))!;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    kitchenTime = app.get(KitchenTime);
    adminCookie = await login('admin@test.com');
    dispatchCookie = await login('dispatch@test.com');
    kitchenCookie = await login('kitchen@test.com');
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
    driverStaffId = (
      await prisma.staff.findUniqueOrThrow({
        where: { staffCode: 'DRIVER-001' },
        select: { id: true },
      })
    ).id;
    kitchenStaffId = (
      await prisma.staff.findUniqueOrThrow({
        where: { staffCode: 'KITCHEN-001' },
        select: { id: true },
      })
    ).id;

    const order = await prisma.order.create({
      data: {
        orderNumber: `DSP-${Date.now()}`,
        companyId,
        customerEmployeeId: employeeId,
        status: 'READY',
        deliveryDate: new Date(`${DATE}T00:00:00.000Z`),
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
    });
    orderId = order.id;
    const drop = await prisma.drop.create({
      data: {
        companyId,
        companyAddressId: addressId,
        deliveryDate: new Date(`${DATE}T00:00:00.000Z`),
        deliveryTime: new Date('1970-01-01T12:30:00.000Z'),
        status: 'PENDING',
        orders: { create: { orderId } },
      },
    });
    dropId = drop.id;
  });

  afterAll(async () => {
    await prisma.dropOrder.deleteMany({ where: { dropId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.drop.deleteMany({ where: { id: dropId } });
    await app.close();
  });

  it('enforces dispatch permissions', async () => {
    await request(app.getHttpServer()).get(`/api/dispatch/drops?date=${DATE}`).expect(401);
    await request(app.getHttpServer())
      .get(`/api/dispatch/drops?date=${DATE}`)
      .set('Cookie', kitchenCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/dispatch/orders/${orderId}/ready`)
      .set('Cookie', driverCookie)
      .expect(403);
  });

  it('walks kitchen-ready → dispatch-ready → out → delivered without skips', async () => {
    await request(app.getHttpServer())
      .post(`/api/dispatch/drops/${dropId}/out`)
      .set('Cookie', dispatchCookie)
      .expect(409);

    await prisma.order.update({ where: { id: orderId }, data: { status: 'IN_KITCHEN' } });
    await request(app.getHttpServer())
      .post(`/api/dispatch/orders/${orderId}/ready`)
      .set('Cookie', dispatchCookie)
      .expect(409);

    await prisma.order.update({ where: { id: orderId }, data: { status: 'READY' } });
    await request(app.getHttpServer())
      .post(`/api/dispatch/orders/${orderId}/ready`)
      .set('Cookie', dispatchCookie)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/dispatch/orders/${orderId}/ready`)
      .set('Cookie', dispatchCookie)
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/dispatch/drops/${dropId}/out`)
      .set('Cookie', dispatchCookie)
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/dispatch/drops/${dropId}/assign-driver`)
      .set('Cookie', dispatchCookie)
      .send({ driverStaffId: kitchenStaffId })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/dispatch/drops/${dropId}/assign-driver`)
      .set('Cookie', dispatchCookie)
      .send({ driverStaffId: driverStaffId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/dispatch/drops/${dropId}/out`)
      .set('Cookie', dispatchCookie)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/dispatch/drops/${dropId}/out`)
      .set('Cookie', dispatchCookie)
      .expect(409);

    const delivered = await request(app.getHttpServer())
      .post(`/api/dispatch/drops/${dropId}/deliver`)
      .set('Cookie', dispatchCookie)
      .expect(201);

    expect(delivered.body.deliveredAt).toBeTruthy();
    expect(typeof delivered.body.onTime).toBe('boolean');

    await request(app.getHttpServer())
      .post(`/api/dispatch/drops/${dropId}/deliver`)
      .set('Cookie', dispatchCookie)
      .expect(409);

    void kitchenTime;
  });
});
