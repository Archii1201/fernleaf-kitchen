import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';

describe('Dashboards (e2e)', () => {
  let app: INestApplication;
  let adminCookie: string;
  let kitchenCookie: string;
  let dispatchCookie: string;
  let driverCookie: string;

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
    adminCookie = await login('admin@test.com');
    kitchenCookie = await login('kitchen@test.com');
    dispatchCookie = await login('dispatch@test.com');
    driverCookie = await login('driver@test.com');
  });

  afterAll(async () => {
    await app.close();
  });

  it('enforces role permissions', async () => {
    await request(app.getHttpServer()).get('/api/dashboard/admin').expect(401);
    await request(app.getHttpServer())
      .get('/api/dashboard/admin')
      .set('Cookie', kitchenCookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/dashboard/kitchen')
      .set('Cookie', driverCookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/dashboard/driver')
      .set('Cookie', dispatchCookie)
      .expect(403);
  });

  it('returns admin money metrics and kitchen without money', async () => {
    const admin = await request(app.getHttpServer())
      .get('/api/dashboard/admin')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(admin.body.metrics.ordersToday).toEqual(expect.any(Number));
    expect(admin.body.metrics.uninvoicedBalanceCents).toEqual(expect.any(Number));
    expect(admin.body.lists.setupGaps).toBeDefined();

    const kitchen = await request(app.getHttpServer())
      .get('/api/dashboard/kitchen')
      .set('Cookie', kitchenCookie)
      .expect(200);
    expect(JSON.stringify(kitchen.body)).not.toMatch(/Cents|invoice/i);

    const dispatch = await request(app.getHttpServer())
      .get('/api/dashboard/dispatch')
      .set('Cookie', dispatchCookie)
      .expect(200);
    expect(dispatch.body.metrics.onTimeRatePercent === null || typeof dispatch.body.metrics.onTimeRatePercent === 'number').toBe(true);

    const driver = await request(app.getHttpServer())
      .get('/api/dashboard/driver')
      .set('Cookie', driverCookie)
      .expect(200);
    expect(driver.body.metrics).toHaveProperty('assigned');
    expect(JSON.stringify(driver.body)).not.toMatch(/invoice|totalCents/i);
  });
});
