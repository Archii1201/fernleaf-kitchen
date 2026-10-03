import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { restoreSeededStandardDishPrices } from './restore-seeded-prices.js';

describe('Menu resolver (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let driverCookie: string;
  let companyId: string;
  let employeeId: string;
  let saladCategoryId: string;
  let saladDishId: string;
  let curryDishId: string;
  let specialDishId: string;
  let hidCategory = false;
  let hidDish = false;

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

    const domain = await prisma.companyDomain.findUniqueOrThrow({
      where: { domain: 'northwind.com' },
      select: { companyId: true },
    });
    companyId = domain.companyId;

    employeeId = (
      await prisma.customerEmployee.findUniqueOrThrow({
        where: { email: 'alice@northwind.com' },
        select: { id: true },
      })
    ).id;

    saladCategoryId = (
      await prisma.menuCategory.findUniqueOrThrow({
        where: { slug: 'salads' },
        select: { id: true },
      })
    ).id;
    saladDishId = (
      await prisma.dish.findUniqueOrThrow({
        where: { sku: 'FK-SALAD-001' },
        select: { id: true },
      })
    ).id;
    curryDishId = (
      await prisma.dish.findUniqueOrThrow({
        where: { sku: 'FK-CURRY-001' },
        select: { id: true },
      })
    ).id;
    specialDishId = (
      await prisma.dish.findUniqueOrThrow({
        where: { sku: 'FK-SPECIAL-001' },
        select: { id: true },
      })
    ).id;

    await restoreSeededStandardDishPrices(prisma);
  });

  afterAll(async () => {
    if (companyId && saladCategoryId) {
      await prisma.companyHiddenCategory.deleteMany({
        where: { companyId, menuCategoryId: saladCategoryId },
      });
      await prisma.menuCategory.update({
        where: { id: saladCategoryId },
        data: { active: true },
      });
    }
    if (companyId && saladDishId) {
      await prisma.companyHiddenDish.deleteMany({
        where: { companyId, dishId: saladDishId },
      });
    }
    await restoreSeededStandardDishPrices(prisma);
    await app.close();
  });

  it('rejects anonymous and unauthorized callers', async () => {
    await request(app.getHttpServer()).get('/api/menu').expect(401);
    await request(app.getHttpServer())
      .get(`/api/menu?companyId=${companyId}`)
      .set('Cookie', driverCookie)
      .expect(403);
  });

  it('lists the normal menu for a company employee', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/menu?companyId=${companyId}&employeeId=${employeeId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(response.body.company.id).toBe(companyId);
    expect(response.body.employee.id).toBe(employeeId);
    const slugs = response.body.categories.map(
      (category: { slug: string }) => category.slug,
    );

    expect(slugs).toContain('mains');
    expect(slugs).not.toContain('off-menu');

    const mains = response.body.categories.find(
      (category: { slug: string }) => category.slug === 'mains',
    );
    const curry = mains.dishes.find(
      (dish: { sku: string }) => dish.sku === 'FK-CURRY-001',
    );

    expect(curry.priceCents).toBe(1_799);
    expect(curry.priceCents).not.toBe(0);
  });

  it('reaches a secret category only by slug', async () => {
    await request(app.getHttpServer())
      .get(`/api/menu/categories/off-menu?companyId=${companyId}`)
      .set('Cookie', adminCookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.categories[0].isSecret).toBe(true);
        expect(body.categories[0].slug).toBe('off-menu');
      });
  });

  it('omits a missing-price dish from the secret category', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/menu/categories/off-menu?companyId=${companyId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(
      response.body.categories[0].dishes.some(
        (dish: { sku: string }) => dish.sku === 'FK-SPECIAL-001',
      ),
    ).toBe(false);
  });

  it('hides a company-hidden category from listing and direct lookup', async () => {
    await prisma.companyHiddenCategory.create({
      data: { companyId, menuCategoryId: saladCategoryId },
    });
    hidCategory = true;

    const listed = await request(app.getHttpServer())
      .get(`/api/menu?companyId=${companyId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(
      listed.body.categories.some(
        (category: { slug: string }) => category.slug === 'salads',
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .get(`/api/menu/categories/salads?companyId=${companyId}`)
      .set('Cookie', adminCookie)
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('MENU_CATEGORY_UNAVAILABLE');
      });

    await prisma.companyHiddenCategory.deleteMany({
      where: { companyId, menuCategoryId: saladCategoryId },
    });
    hidCategory = false;
  });

  it('omits a company-hidden dish', async () => {
    await prisma.companyHiddenDish.create({
      data: { companyId, dishId: saladDishId },
    });
    hidDish = true;

    const response = await request(app.getHttpServer())
      .get(`/api/menu/categories/salads?companyId=${companyId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(response.body.categories[0].dishes).toHaveLength(0);

    await prisma.companyHiddenDish.deleteMany({
      where: { companyId, dishId: saladDishId },
    });
    hidDish = false;
  });

  it('rejects an inactive category on direct lookup', async () => {
    await prisma.menuCategory.update({
      where: { slug: 'salads' },
      data: { active: false },
    });

    await request(app.getHttpServer())
      .get(`/api/menu/categories/salads?companyId=${companyId}`)
      .set('Cookie', adminCookie)
      .expect(400);

    await prisma.menuCategory.update({
      where: { slug: 'salads' },
      data: { active: true },
    });
  });

  it('lets the order seam accept a priced dish and reject a missing-price dish', async () => {
    await request(app.getHttpServer())
      .post('/api/menu/availability')
      .set('Cookie', adminCookie)
      .send({
        companyId,
        items: [{ dishId: curryDishId }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/menu/availability')
      .set('Cookie', adminCookie)
      .send({
        companyId,
        items: [{ dishId: specialDishId }],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('DISH_NOT_ORDERABLE');
      });
  });

  afterEach(async () => {
    if (hidCategory) {
      await prisma.companyHiddenCategory.deleteMany({
        where: { companyId, menuCategoryId: saladCategoryId },
      });
    }

    if (hidDish) {
      await prisma.companyHiddenDish.deleteMany({
        where: { companyId, dishId: saladDishId },
      });
    }
  });
});
