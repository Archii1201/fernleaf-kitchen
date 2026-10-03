import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Admin overrides (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let kitchenCookie: string;
  let companyId: string;
  let otherCompanyAddressId: string;
  let addressId: string;
  let extraAddressId: string;
  let employeeId: string;
  let tierId: string;
  let boxId: string;
  let bagId: string;
  let orderId: string;
  let startedAt: Date;

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
    otherCompanyAddressId = (
      await prisma.companyDomain.findUniqueOrThrow({
        where: { domain: 'contoso.com' },
        select: { company: { select: { defaultAddressId: true } } },
      })
    ).company.defaultAddressId!;
    extraAddressId = (
      await prisma.companyAddress.create({
        data: {
          companyId,
          label: `Override-${Date.now()}`,
          line1: '9 Side Street',
          city: 'Bengaluru',
          postalCode: '560001',
          country: 'IN',
        },
      })
    ).id;
    boxId = (await prisma.packagingType.findUniqueOrThrow({ where: { code: 'INDIVIDUAL' } })).id;
    bagId = (await prisma.packagingType.findUniqueOrThrow({ where: { code: 'BUFFET' } })).id;
    startedAt = new Date('2026-10-04T04:00:00.000Z');

    const order = await prisma.order.create({
      data: {
        orderNumber: `ADM-${Date.now()}`,
        companyId,
        customerEmployeeId: employeeId,
        status: 'CONFIRMED',
        deliveryDate: new Date('2026-10-04T00:00:00.000Z'),
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
        kitchenStartedAt: startedAt,
        kitchenReadyAt: new Date('2026-10-04T05:30:00.000Z'),
        dispatchReadyAt: new Date('2026-10-04T06:00:00.000Z'),
        subtotalCents: 2099,
        totalCents: 2099,
        version: 3,
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.companyAddress.deleteMany({ where: { id: extraAddressId } });
    await prisma.packagingType.update({ where: { id: bagId }, data: { active: true } });
    await app.close();
  });

  it('blocks non-admin callers', async () => {
    await request(app.getHttpServer())
      .put(`/api/orders/${orderId}/admin/delivery-time`)
      .set('Cookie', kitchenCookie)
      .send({ deliveryTime: '13:00', version: 3 })
      .expect(403);
  });

  it('overrides time/address/packaging without touching money or actuals', async () => {
    const time = await request(app.getHttpServer())
      .put(`/api/orders/${orderId}/admin/delivery-time`)
      .set('Cookie', adminCookie)
      .send({ deliveryTime: '13:00', version: 3 })
      .expect(200);

    expect(time.body.delivery.time).toBe('13:00');
    expect(time.body.totalCents).toBe(2099);
    expect(time.body.version).toBe(4);
    const afterTime = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(afterTime.kitchenStartedAt?.toISOString()).toBe(startedAt.toISOString());
    expect(afterTime.dispatchReadyAt?.toISOString()).not.toBe(
      '2026-10-04T06:00:00.000Z',
    );

    await request(app.getHttpServer())
      .put(`/api/orders/${orderId}/admin/delivery-time`)
      .set('Cookie', adminCookie)
      .send({ deliveryTime: '14:00', version: 3 })
      .expect(409);

    await request(app.getHttpServer())
      .put(`/api/orders/${orderId}/admin/address`)
      .set('Cookie', adminCookie)
      .send({ addressId: otherCompanyAddressId, version: 4 })
      .expect(400);

    const address = await request(app.getHttpServer())
      .put(`/api/orders/${orderId}/admin/address`)
      .set('Cookie', adminCookie)
      .send({ addressId: extraAddressId, version: 4 })
      .expect(200);
    expect(address.body.delivery.address.id).toBe(extraAddressId);
    expect(address.body.totalCents).toBe(2099);

    await prisma.packagingType.update({ where: { id: bagId }, data: { active: false } });
    await request(app.getHttpServer())
      .put(`/api/orders/${orderId}/admin/packaging`)
      .set('Cookie', adminCookie)
      .send({ packagingTypeId: bagId, version: 5 })
      .expect(400);

    const pack = await request(app.getHttpServer())
      .put(`/api/orders/${orderId}/admin/packaging`)
      .set('Cookie', adminCookie)
      .send({ packagingTypeId: boxId, version: 5 })
      .expect(200);
    expect(pack.body.delivery.packagingTypeName).toBeTruthy();

    const invoice = await prisma.invoice.create({
      data: {
        companyId,
        invoiceNumber: `INV-ADM-${Date.now()}`,
        status: 'ISSUED',
        subtotalCents: 2099,
        totalCents: 2099,
      },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { invoiceId: invoice.id },
    });

    await request(app.getHttpServer())
      .put(`/api/orders/${orderId}/admin/delivery-time`)
      .set('Cookie', adminCookie)
      .send({ deliveryTime: '15:00', version: 6 })
      .expect(200);

    await prisma.order.update({ where: { id: orderId }, data: { invoiceId: null } });
    await prisma.invoice.delete({ where: { id: invoice.id } });
  });
});
