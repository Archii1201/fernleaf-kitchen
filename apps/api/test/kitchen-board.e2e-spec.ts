import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const DATE = '2026-01-14';

describe('Kitchen board (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let kitchenCookie: string;
  let driverCookie: string;
  let companyId: string;
  let employeeId: string;
  let addressId: string;
  let tierId: string;
  let dish: { id: string; name: string; sku: string; kitchenStationId: string };
  let station: { id: string; code: string; name: string };
  let orderId: string;
  let unitId: string;
  let draftId: string;

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
    dish = await prisma.dish.findUniqueOrThrow({
      where: { sku: 'FK-WRAP-001' },
      select: {
        id: true,
        name: true,
        sku: true,
        kitchenStationId: true,
      },
    });
    station = await prisma.kitchenStation.findUniqueOrThrow({
      where: { id: dish.kitchenStationId },
      select: { id: true, code: true, name: true },
    });

    await prisma.prepUnit.deleteMany({
      where: { order: { deliveryDate: new Date(`${DATE}T00:00:00.000Z`) } },
    });
    await prisma.order.deleteMany({
      where: { deliveryDate: new Date(`${DATE}T00:00:00.000Z`) },
    });

    const confirmed = await prisma.order.create({
      data: {
        orderNumber: `KB-CONF-${Date.now()}`,
        companyId,
        customerEmployeeId: employeeId,
        status: 'CONFIRMED',
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
        kitchenReadyAt: new Date('2026-01-14T05:30:00.000Z'),
        dispatchReadyAt: new Date('2026-01-14T06:00:00.000Z'),
        subtotalCents: 2099,
        totalCents: 2099,
        lines: {
          create: {
            dishId: dish.id,
            dishName: dish.name,
            dishSku: dish.sku,
            dishTemperature: 'HOT',
            kitchenStationId: station.id,
            kitchenStationCode: station.code,
            kitchenStationName: station.name,
            quantity: 1,
            unitPriceCents: 2099,
            lineTotalCents: 2099,
            combinations: {
              create: {
                quantity: 1,
                unitPriceCents: 2099,
                optionsPriceCents: 0,
                totalCents: 2099,
                signature: 'no-options',
              },
            },
          },
        },
      },
      include: { lines: { include: { combinations: true } } },
    });
    orderId = confirmed.id;
    const comboId = confirmed.lines[0].combinations[0].id;
    const unit = await prisma.prepUnit.create({
      data: {
        orderId,
        orderCombinationId: comboId,
        kitchenStationId: station.id,
        kitchenStationCode: station.code,
        kitchenStationName: station.name,
        dishName: dish.name,
        quantity: 1,
        status: 'PENDING',
      },
    });
    unitId = unit.id;

    const draft = await prisma.order.create({
      data: {
        orderNumber: `KB-DRAFT-${Date.now()}`,
        companyId,
        customerEmployeeId: employeeId,
        status: 'DRAFT',
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
        subtotalCents: 0,
        totalCents: 0,
      },
    });
    draftId = draft.id;
  });

  afterAll(async () => {
    await prisma.prepUnit.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: { in: [orderId, draftId] } } });
    await app.close();
  });

  it('enforces kitchen permissions', async () => {
    await request(app.getHttpServer()).get(`/api/kitchen/board?date=${DATE}`).expect(401);
    await request(app.getHttpServer())
      .get(`/api/kitchen/board?date=${DATE}`)
      .set('Cookie', driverCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/kitchen/orders/${orderId}/force-complete`)
      .set('Cookie', kitchenCookie)
      .expect(403);
  });

  it('lists only confirmed kitchen work and keeps the station snapshot', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/kitchen/board?date=${DATE}`)
      .set('Cookie', kitchenCookie)
      .expect(200);

    const ids = response.body.stations.flatMap(
      (stationRow: { orders: { id: string; units: { station: { code: string } }[] }[] }) =>
        stationRow.orders.map((order) => order.id),
    );
    expect(ids).toContain(orderId);
    expect(ids).not.toContain(draftId);
    expect(
      response.body.stations[0].orders[0].units[0].station.code,
    ).toBe(station.code);
  });

  it('starts once, completes pending-to-done with startedAt, and force-complete is admin-only and idempotent', async () => {
    await request(app.getHttpServer())
      .post(`/api/kitchen/units/${unitId}/start`)
      .set('Cookie', kitchenCookie)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/kitchen/units/${unitId}/start`)
      .set('Cookie', kitchenCookie)
      .expect(409);

    await prisma.prepUnit.update({
      where: { id: unitId },
      data: { status: 'PENDING', startedAt: null, completedAt: null },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CONFIRMED', kitchenStartedAt: null },
    });

    const done = await request(app.getHttpServer())
      .post(`/api/kitchen/units/${unitId}/done`)
      .set('Cookie', kitchenCookie)
      .expect(201);

    expect(done.body.prepUnits[0].startedAt).toBeTruthy();
    expect(done.body.prepUnits[0].completedAt).toBeTruthy();
    expect(done.body.status).toBe('READY');

    await request(app.getHttpServer())
      .post(`/api/kitchen/units/${unitId}/done`)
      .set('Cookie', kitchenCookie)
      .expect(409);

    const forced = await request(app.getHttpServer())
      .post(`/api/kitchen/orders/${orderId}/force-complete`)
      .set('Cookie', adminCookie)
      .expect(201);

    expect(forced.body.prepUnits[0].completedAt).toBe(done.body.prepUnits[0].completedAt);
  });
});
