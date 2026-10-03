import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { MAX_FILE_BYTES } from '../src/files/files.errors.js';
import { KitchenTime } from '../src/kitchen/time/kitchen-time.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Driver (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let kitchenTime: KitchenTime;
  let driverCookie: string;
  let dispatchCookie: string;
  let companyId: string;
  let employeeId: string;
  let addressId: string;
  let tierId: string;
  let driverStaffId: string;
  let today: string;
  let otherDate: string;
  let ownDropId: string;
  let otherDriverDropId: string;
  let otherDateDropId: string;
  let lateDropId: string;
  let createdOrderIds: string[] = [];
  let createdDropIds: string[] = [];

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: SEED_PASSWORD })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return cookies.find((cookie) => cookie.startsWith(AUTH_COOKIE_NAME))!;
  }

  async function createDrop(opts: {
    date: string;
    time: string;
    driverStaffId: string | null;
    suffix: string;
  }) {
    const order = await prisma.order.create({
      data: {
        orderNumber: `DRV-${opts.suffix}`,
        companyId,
        customerEmployeeId: employeeId,
        status: 'OUT_FOR_DELIVERY',
        deliveryDate: new Date(`${opts.date}T00:00:00.000Z`),
        deliveryTime: kitchenTime.fromTimeString(opts.time),
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
    createdOrderIds.push(order.id);
    const drop = await prisma.drop.create({
      data: {
        companyId,
        companyAddressId: addressId,
        deliveryDate: new Date(`${opts.date}T00:00:00.000Z`),
        deliveryTime: kitchenTime.fromTimeString(opts.time),
        status: 'OUT_FOR_DELIVERY',
        driverStaffId: opts.driverStaffId,
        orders: { create: { orderId: order.id } },
      },
    });
    createdDropIds.push(drop.id);
    return drop.id;
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
    driverCookie = await login('driver@test.com');
    dispatchCookie = await login('dispatch@test.com');
    today = kitchenTime.today();
    otherDate = '2026-01-02';

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

    ownDropId = await createDrop({
      date: today,
      time: '23:45',
      driverStaffId,
      suffix: `own-${Date.now()}`,
    });
    otherDriverDropId = await createDrop({
      date: today,
      time: '23:50',
      driverStaffId: (
        await prisma.staff.findUniqueOrThrow({
          where: { staffCode: 'ADMIN-001' },
          select: { id: true },
        })
      ).id,
      suffix: `other-${Date.now()}`,
    });
    otherDateDropId = await createDrop({
      date: otherDate,
      time: '12:00',
      driverStaffId,
      suffix: `past-${Date.now()}`,
    });
    lateDropId = await createDrop({
      date: today,
      time: '00:01',
      driverStaffId,
      suffix: `late-${Date.now()}`,
    });
  });

  afterAll(async () => {
    await prisma.dropOrder.deleteMany({ where: { dropId: { in: createdDropIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.drop.deleteMany({ where: { id: { in: createdDropIds } } });
    await app.close();
  });

  it('enforces driver permissions and scopes the today list', async () => {
    await request(app.getHttpServer()).get('/api/driver/drops/today').expect(401);
    await request(app.getHttpServer())
      .get('/api/driver/drops/today')
      .set('Cookie', dispatchCookie)
      .expect(403);

    const list = await request(app.getHttpServer())
      .get('/api/driver/drops/today')
      .set('Cookie', driverCookie)
      .expect(200);

    const ids = list.body.drops.map((drop: { id: string }) => drop.id);
    expect(ids).toContain(ownDropId);
    expect(ids).toContain(lateDropId);
    expect(ids).not.toContain(otherDriverDropId);
    expect(ids).not.toContain(otherDateDropId);
    expect(JSON.stringify(list.body)).not.toMatch(/Cents|price|subtotal/i);
  });

  it('rejects another driver\'s drop, oversized photos, and repeats', async () => {
    await request(app.getHttpServer())
      .post(`/api/driver/drops/${otherDriverDropId}/deliver`)
      .set('Cookie', driverCookie)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/driver/drops/${ownDropId}/deliver`)
      .set('Cookie', driverCookie)
      .attach('file', Buffer.alloc(MAX_FILE_BYTES + 1), {
        filename: 'big.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);

    const first = await request(app.getHttpServer())
      .post(`/api/driver/drops/${ownDropId}/deliver`)
      .set('Cookie', driverCookie)
      .field('note', 'Left at reception')
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'pod.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    expect(first.body.notes).toBe('Left at reception');
    expect(first.body.deliveryPhotoFileId).toBeTruthy();
    expect(first.body.deliveredAt).toBeTruthy();
    expect(first.body.onTime).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/driver/drops/${ownDropId}/deliver`)
      .set('Cookie', driverCookie)
      .expect(409);

    const [a, b] = await Promise.allSettled([
      request(app.getHttpServer())
        .post(`/api/driver/drops/${lateDropId}/deliver`)
        .set('Cookie', driverCookie),
      request(app.getHttpServer())
        .post(`/api/driver/drops/${lateDropId}/deliver`)
        .set('Cookie', driverCookie),
    ]);
    const statuses = [a, b]
      .map((result) => (result.status === 'fulfilled' ? result.value.status : 500))
      .sort();
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);

    const late = await prisma.drop.findUniqueOrThrow({ where: { id: lateDropId } });
    expect(late.deliveredAt).toBeTruthy();
    expect(late.onTime).toBe(false);
  });
});
