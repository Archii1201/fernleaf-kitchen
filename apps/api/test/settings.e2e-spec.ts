import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SEED_PASSWORD } from '../prisma/seed.js';

const HOLIDAY_DATE = '2031-12-25';

describe('Kitchen settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let driverCookie: string;
  let holidayId: string | undefined;

  async function login(email: string): Promise<string> {
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
    driverCookie = await login('driver@test.com');

    await prisma.kitchenHoliday.deleteMany({
      where: { date: new Date(`${HOLIDAY_DATE}T00:00:00.000Z`) },
    });
  });

  afterAll(async () => {
    await prisma.kitchenHoliday.deleteMany({
      where: { date: new Date(`${HOLIDAY_DATE}T00:00:00.000Z`) },
    });
    await app.close();
  });

  it('rejects anonymous access', async () => {
    await request(app.getHttpServer()).get('/api/settings').expect(401);
  });

  it('rejects a user without settings.read', async () => {
    await request(app.getHttpServer())
      .get('/api/settings')
      .set('Cookie', driverCookie)
      .expect(403);
  });

  it('returns the seeded settings to an admin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/settings')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(response.body).toMatchObject({
      cutoffTime: expect.stringMatching(/^\d{2}:\d{2}$/),
      timeZone: expect.any(String),
    });
    expect(Array.isArray(response.body.workingDays)).toBe(true);
  });

  it('updates the cutoff configuration and working week', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/settings')
      .set('Cookie', adminCookie)
      .send({
        cutoffTime: '16:00',
        cutoffWorkingDays: 2,
        workingDays: [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
        ],
      })
      .expect(200);

    expect(response.body.cutoffTime).toBe('16:00');
    expect(response.body.cutoffWorkingDays).toBe(2);
    expect(response.body.workingDays).toEqual([
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
    ]);
  });

  it('rejects an invalid settings payload', async () => {
    await request(app.getHttpServer())
      .put('/api/settings')
      .set('Cookie', adminCookie)
      .send({ cutoffTime: '16:00', cutoffWorkingDays: 2, workingDays: [] })
      .expect(400);
  });

  it('refuses settings changes without settings.manage', async () => {
    await request(app.getHttpServer())
      .put('/api/settings')
      .set('Cookie', driverCookie)
      .send({
        cutoffTime: '10:00',
        cutoffWorkingDays: 1,
        workingDays: ['MONDAY'],
      })
      .expect(403);
  });

  it('adds, lists and removes a holiday', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/settings/holidays')
      .set('Cookie', adminCookie)
      .send({ date: HOLIDAY_DATE, name: 'Christmas' })
      .expect(201);

    holidayId = created.body.id;
    expect(created.body.date).toBe(HOLIDAY_DATE);

    await request(app.getHttpServer())
      .post('/api/settings/holidays')
      .set('Cookie', adminCookie)
      .send({ date: HOLIDAY_DATE })
      .expect(409);

    const listed = await request(app.getHttpServer())
      .get('/api/settings/holidays?limit=100')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(
      listed.body.data.some(
        (holiday: { date: string }) => holiday.date === HOLIDAY_DATE,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/settings/holidays/${holidayId}`)
      .set('Cookie', adminCookie)
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/api/settings/holidays/${holidayId}`)
      .set('Cookie', adminCookie)
      .expect(404);
  });

  it('previews the cutoff for a delivery date', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/settings/cutoff-preview?deliveryDate=2031-10-08')
      .set('Cookie', adminCookie)
      .expect(200);

    // 2031-10-08 is a Wednesday; two working days back is Monday the 6th.
    expect(response.body.cutoffDate).toBe('2031-10-06');
    expect(response.body).toMatchObject({
      deliveryDate: '2031-10-08',
      hasPassed: false,
    });
  });

  it('rejects a malformed delivery date', async () => {
    await request(app.getHttpServer())
      .get('/api/settings/cutoff-preview?deliveryDate=08-10-2031')
      .set('Cookie', adminCookie)
      .expect(400);
  });
});
