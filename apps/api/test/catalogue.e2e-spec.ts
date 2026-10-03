import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SEED_PASSWORD } from '../prisma/seed.js';

const SUFFIX = Date.now();
const DISH_SKU = `STEP7-DISH-${SUFFIX}`;
const OPTION_CODE = `STEP7-OPT-${SUFFIX}`;
const GROUP_CODE = `STEP7-GRP-${SUFFIX}`;

describe('Catalogue (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let driverCookie: string;
  let kitchenStationId: string;
  let dishId: string;
  let optionId: string;
  let optionGroupId: string;

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

    kitchenStationId = (
      await prisma.kitchenStation.findFirstOrThrow({ select: { id: true } })
    ).id;
  });

  afterAll(async () => {
    await prisma.dish.deleteMany({ where: { sku: DISH_SKU } });
    await prisma.optionGroup.deleteMany({ where: { code: GROUP_CODE } });
    await prisma.option.deleteMany({ where: { code: OPTION_CODE } });
    await app.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/dishes').expect(401);
  });

  it('refuses a user without catalogue.view', async () => {
    await request(app.getHttpServer())
      .get('/api/dishes')
      .set('Cookie', driverCookie)
      .expect(403);
  });

  it('exposes reference data to catalogue viewers', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/reference/kitchen-stations')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(response.body.length).toBeGreaterThan(0);
  });

  it('creates a dish', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/dishes')
      .set('Cookie', adminCookie)
      .send({
        name: `Step 7 Dish ${SUFFIX}`,
        sku: DISH_SKU,
        temperature: 'HOT',
        costCents: 25000,
        kitchenStationId,
        minimumOrderQuantity: 5,
      })
      .expect(201);

    dishId = response.body.id;
    expect(response.body).toMatchObject({
      sku: DISH_SKU,
      costCents: 25000,
      minimumOrderQuantity: 5,
      active: true,
    });
  });

  it('rejects a duplicate SKU', async () => {
    await request(app.getHttpServer())
      .post('/api/dishes')
      .set('Cookie', adminCookie)
      .send({
        name: 'Duplicate',
        sku: DISH_SKU,
        temperature: 'HOT',
        costCents: 100,
        kitchenStationId,
      })
      .expect(409);
  });

  it('rejects an unknown kitchen station', async () => {
    await request(app.getHttpServer())
      .post('/api/dishes')
      .set('Cookie', adminCookie)
      .send({
        name: 'Orphan',
        sku: `${DISH_SKU}-ORPHAN`,
        temperature: 'HOT',
        costCents: 100,
        kitchenStationId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(400);
  });

  it('lists dishes with pagination metadata and search', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/dishes?search=${DISH_SKU}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(response.body.meta).toMatchObject({ page: 1, limit: 20 });
    expect(response.body.data).toHaveLength(1);
  });

  it('updates a dish', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/dishes/${dishId}`)
      .set('Cookie', adminCookie)
      .send({ costCents: 27500 })
      .expect(200);

    expect(response.body.costCents).toBe(27500);
  });

  it('creates an option and an option group and links them', async () => {
    optionId = (
      await request(app.getHttpServer())
        .post('/api/options')
        .set('Cookie', adminCookie)
        .send({ code: OPTION_CODE, name: 'Extra paneer', costCents: 4000 })
        .expect(201)
    ).body.id;

    optionGroupId = (
      await request(app.getHttpServer())
        .post('/api/option-groups')
        .set('Cookie', adminCookie)
        .send({
          code: GROUP_CODE,
          name: `Step 7 Group ${SUFFIX}`,
          required: true,
          maxSelections: 1,
        })
        .expect(201)
    ).body.id;

    const group = await request(app.getHttpServer())
      .put(`/api/option-groups/${optionGroupId}/options`)
      .set('Cookie', adminCookie)
      .send({ options: [{ optionId }] })
      .expect(200);

    expect(group.body.options).toHaveLength(1);
    expect(group.body.options[0].id).toBe(optionId);
  });

  it('attaches the option group to the dish', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/dishes/${dishId}/option-groups`)
      .set('Cookie', adminCookie)
      .send({ optionGroupIds: [optionGroupId] })
      .expect(200);

    expect(response.body.optionGroups).toHaveLength(1);
    expect(response.body.optionGroups[0].id).toBe(optionGroupId);
  });

  it('deactivates rather than deletes a dish', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/dishes/${dishId}/active`)
      .set('Cookie', adminCookie)
      .send({ active: false })
      .expect(200);

    expect(response.body.active).toBe(false);

    const inactive = await request(app.getHttpServer())
      .get(`/api/dishes?active=false&search=${DISH_SKU}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(inactive.body.data).toHaveLength(1);
  });

  it('deactivates an option', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/options/${optionId}/active`)
      .set('Cookie', adminCookie)
      .send({ active: false })
      .expect(200);

    expect(response.body.active).toBe(false);
  });

  it('404s for an unknown dish', async () => {
    await request(app.getHttpServer())
      .get('/api/dishes/00000000-0000-4000-8000-000000000000')
      .set('Cookie', adminCookie)
      .expect(404);
  });

  it('refuses catalogue writes without catalogue.manage', async () => {
    await request(app.getHttpServer())
      .patch(`/api/dishes/${dishId}/active`)
      .set('Cookie', driverCookie)
      .send({ active: true })
      .expect(403);
  });
});
