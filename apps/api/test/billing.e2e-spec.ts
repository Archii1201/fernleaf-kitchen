import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let kitchenCookie: string;
  let companyId: string;
  let employeeId: string;
  let addressId: string;
  let tierId: string;
  let orderA: string;
  let orderB: string;
  let invoiceIds: string[] = [];

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: SEED_PASSWORD })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return cookies.find((cookie) => cookie.startsWith(AUTH_COOKIE_NAME))!;
  }

  async function insert(suffix: string, totalCents: number) {
    const order = await prisma.order.create({
      data: {
        orderNumber: `BIL-${suffix}`,
        companyId,
        customerEmployeeId: employeeId,
        status: 'CONFIRMED',
        deliveryDate: new Date('2026-09-01T00:00:00.000Z'),
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
        subtotalCents: totalCents,
        totalCents,
      },
    });
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
    kitchenCookie = await login('kitchen@test.com');

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
    orderA = await insert(`A-${Date.now()}`, 2000);
    orderB = await insert(`B-${Date.now()}`, 1500);
  });

  afterAll(async () => {
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.orderCredit.deleteMany({ where: { orderId: { in: [orderA, orderB] } } });
    await prisma.order.updateMany({
      where: { id: { in: [orderA, orderB] } },
      data: { invoiceId: null },
    });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.order.deleteMany({ where: { id: { in: [orderA, orderB] } } });
    await app.close();
  });

  it('protects billing routes and lists confirmed uninvoiced orders by company', async () => {
    await request(app.getHttpServer()).get('/api/billing/orders').expect(401);
    await request(app.getHttpServer())
      .get('/api/billing/orders')
      .set('Cookie', kitchenCookie)
      .expect(403);

    const list = await request(app.getHttpServer())
      .get('/api/billing/orders')
      .set('Cookie', adminCookie)
      .expect(200);

    const group = list.body.data.find(
      (row: { company: { id: string } }) => row.company.id === companyId,
    );
    const ids = group.orders.map((order: { id: string }) => order.id);
    expect(ids).toEqual(expect.arrayContaining([orderA, orderB]));
  });

  it('creates, voids, re-invoices, pays, and applies credits in cents', async () => {
    const credit = await request(app.getHttpServer())
      .post(`/api/orders/${orderA}/credits`)
      .set('Cookie', adminCookie)
      .send({ amountCents: 500, reason: 'Goodwill' })
      .expect(201);
    expect(credit.body.amountCents).toBe(500);

    await request(app.getHttpServer())
      .post(`/api/orders/${orderA}/credits`)
      .set('Cookie', adminCookie)
      .send({ amountCents: 2000, reason: 'too much' })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post('/api/invoices')
      .set('Cookie', adminCookie)
      .send({ orderIds: [orderA, orderB] })
      .expect(201);
    invoiceIds.push(created.body.id);
    expect(created.body.subtotalCents).toBe(3500);
    expect(created.body.creditCents).toBe(500);
    expect(created.body.totalCents).toBe(3000);

    await request(app.getHttpServer())
      .post('/api/invoices')
      .set('Cookie', adminCookie)
      .send({ orderIds: [orderA] })
      .expect(409);

    const [first, second] = await Promise.allSettled([
      request(app.getHttpServer())
        .post('/api/invoices')
        .set('Cookie', adminCookie)
        .send({ orderIds: [orderA] }),
      request(app.getHttpServer())
        .post('/api/invoices')
        .set('Cookie', adminCookie)
        .send({ orderIds: [orderA] }),
    ]);
    const statuses = [first, second].map((result) =>
      result.status === 'fulfilled' ? result.value.status : 500,
    );
    expect(statuses.every((status) => status === 409)).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/invoices/${created.body.id}/void`)
      .set('Cookie', adminCookie)
      .expect(201);

    const again = await request(app.getHttpServer())
      .post('/api/invoices')
      .set('Cookie', adminCookie)
      .send({ orderIds: [orderA, orderB] })
      .expect(201);
    invoiceIds.push(again.body.id);
    expect(again.body.totalCents).toBe(3000);

    await request(app.getHttpServer())
      .post(`/api/invoices/${again.body.id}/paid`)
      .set('Cookie', adminCookie)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/invoices/${again.body.id}/paid`)
      .set('Cookie', adminCookie)
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/invoices/${again.body.id}/void`)
      .set('Cookie', adminCookie)
      .expect(409);
  });
});
