import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SEED_PASSWORD } from '../prisma/seed.js';

const SUFFIX = Date.now();
const NEW_TIER_CODE = `STEP8-${SUFFIX}`;

/** Seeded fixtures (see prisma/seed.ts). */
const PRICED_DISH_SKU = 'FK-CURRY-001';
const UNPRICED_DISH_SKU = 'FK-SPECIAL-001';

describe('Pricing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let kitchenCookie: string;
  let driverCookie: string;
  let standardTierId: string;
  let enterpriseTierId: string;
  let partnerTierId: string;
  let createdTierId: string;
  let pricedDishId: string;
  let unpricedDishId: string;

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
    kitchenCookie = await login('kitchen@test.com');
    driverCookie = await login('driver@test.com');

    const tiers = await prisma.priceTier.findMany({
      select: { id: true, code: true },
    });
    standardTierId = tiers.find((tier) => tier.code === 'STANDARD')!.id;
    enterpriseTierId = tiers.find((tier) => tier.code === 'ENTERPRISE')!.id;
    partnerTierId = tiers.find((tier) => tier.code === 'PARTNER')!.id;

    pricedDishId = (
      await prisma.dish.findUniqueOrThrow({
        where: { sku: PRICED_DISH_SKU },
        select: { id: true },
      })
    ).id;
    unpricedDishId = (
      await prisma.dish.findUniqueOrThrow({
        where: { sku: UNPRICED_DISH_SKU },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (createdTierId) {
      await prisma.priceTier.deleteMany({ where: { id: createdTierId } });
    }

    // Leave the seeded grid exactly as the seed defines it.
    await prisma.dishTierPrice.deleteMany({
      where: { priceTierId: enterpriseTierId, dishId: pricedDishId },
    });
    await prisma.dishTierPrice.deleteMany({
      where: { priceTierId: standardTierId, dishId: unpricedDishId },
    });
    await app.close();
  });

  describe('authorization', () => {
    it('rejects anonymous callers', async () => {
      await request(app.getHttpServer()).get('/api/price-tiers').expect(401);
    });

    it('rejects a user with neither pricing permission', async () => {
      await request(app.getHttpServer())
        .get('/api/price-tiers')
        .set('Cookie', driverCookie)
        .expect(403);
    });

    it('lets a catalogue viewer read pricing but not manage it', async () => {
      await request(app.getHttpServer())
        .get('/api/price-tiers')
        .set('Cookie', kitchenCookie)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/price-tiers/${standardTierId}/make-default`)
        .set('Cookie', kitchenCookie)
        .expect(403);

      await request(app.getHttpServer())
        .put(`/api/price-tiers/${standardTierId}/prices`)
        .set('Cookie', kitchenCookie)
        .send({
          prices: [
            { itemType: 'dish', itemId: pricedDishId, priceCents: 100 },
          ],
        })
        .expect(403);
    });
  });

  describe('tier management', () => {
    it('lists the seeded tiers with their rules', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/price-tiers')
        .set('Cookie', adminCookie)
        .expect(200);

      const byCode = Object.fromEntries(
        response.body.map((tier: { code: string }) => [tier.code, tier]),
      );

      expect(byCode.ENTERPRISE.rule).toBe('cost x 2.4');
      expect(byCode.PARTNER.rule).toBe('Standard + 15%');
      expect(byCode.PARTNER.chain).toEqual([partnerTierId, standardTierId]);
      expect(
        response.body.filter((tier: { isDefault: boolean }) => tier.isDefault),
      ).toHaveLength(1);
    });

    it('creates a derived tier', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/price-tiers')
        .set('Cookie', adminCookie)
        .send({
          code: NEW_TIER_CODE,
          name: `Step 8 Tier ${SUFFIX}`,
          strategy: 'BASE_MARKUP',
          markupBasisPoints: 1_000,
          baseTierId: standardTierId,
        })
        .expect(201);

      createdTierId = response.body.id;
      expect(response.body.rule).toBe('Standard + 10%');
      expect(response.body.isDefault).toBe(false);
    });

    it('rejects a duplicate tier code', async () => {
      await request(app.getHttpServer())
        .post('/api/price-tiers')
        .set('Cookie', adminCookie)
        .send({
          code: NEW_TIER_CODE,
          name: `Another ${SUFFIX}`,
          strategy: 'EXPLICIT',
        })
        .expect(409);
    });

    it('rejects a base-markup tier with no base', async () => {
      await request(app.getHttpServer())
        .post('/api/price-tiers')
        .set('Cookie', adminCookie)
        .send({
          code: `${NEW_TIER_CODE}-BAD`,
          name: `Bad ${SUFFIX}`,
          strategy: 'BASE_MARKUP',
          markupBasisPoints: 500,
        })
        .expect(400);
    });

    it('rejects a self-referencing tier', async () => {
      await request(app.getHttpServer())
        .patch(`/api/price-tiers/${createdTierId}`)
        .set('Cookie', adminCookie)
        .send({
          strategy: 'BASE_MARKUP',
          markupBasisPoints: 500,
          baseTierId: createdTierId,
        })
        .expect(400);
    });

    it('rejects a derivation cycle', async () => {
      await request(app.getHttpServer())
        .patch(`/api/price-tiers/${standardTierId}`)
        .set('Cookie', adminCookie)
        .send({
          strategy: 'BASE_MARKUP',
          markupBasisPoints: 500,
          baseTierId: partnerTierId,
        })
        .expect(400);
    });

    it('keeps exactly one default across a make-default switch', async () => {
      await request(app.getHttpServer())
        .post(`/api/price-tiers/${enterpriseTierId}/make-default`)
        .set('Cookie', adminCookie)
        .expect(200);

      const switched = await request(app.getHttpServer())
        .get('/api/price-tiers')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(
        switched.body.filter((tier: { isDefault: boolean }) => tier.isDefault),
      ).toHaveLength(1);

      // Put the seeded default back.
      await request(app.getHttpServer())
        .post(`/api/price-tiers/${standardTierId}/make-default`)
        .set('Cookie', adminCookie)
        .expect(200);
    });

    it('refuses to deactivate the default tier', async () => {
      await request(app.getHttpServer())
        .patch(`/api/price-tiers/${standardTierId}`)
        .set('Cookie', adminCookie)
        .send({ active: false })
        .expect(400);
    });
  });

  describe('price grid', () => {
    it('returns cost, derived, override and effective prices', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/price-tiers/${standardTierId}/prices?type=dish&limit=100`)
        .set('Cookie', adminCookie)
        .expect(200);

      const priced = response.body.data.find(
        (row: { reference: string }) => row.reference === PRICED_DISH_SKU,
      );

      expect(priced).toMatchObject({
        costCents: 880,
        overrideCents: 1_799,
        effectivePriceCents: 1_799,
        source: 'EXPLICIT',
        missing: false,
      });
    });

    it('derives prices on a cost-multiplier tier', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/price-tiers/${enterpriseTierId}/prices?type=dish&q=${PRICED_DISH_SKU}`)
        .set('Cookie', adminCookie)
        .expect(200);

      // 880 x 2.4 = 2112 -> rounded up to the next 5 cents.
      expect(response.body.data[0]).toMatchObject({
        derivedPriceCents: 2_115,
        effectivePriceCents: 2_115,
        source: 'DERIVED',
      });
    });

    it('filters to missing prices and never reports them as zero', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/price-tiers/${standardTierId}/prices?type=dish&missingOnly=true`)
        .set('Cookie', adminCookie)
        .expect(200);

      const missing = response.body.data.find(
        (row: { reference: string }) => row.reference === UNPRICED_DISH_SKU,
      );

      expect(missing).toMatchObject({
        missing: true,
        effectivePriceCents: null,
        missingReason: 'NO_EXPLICIT_PRICE',
      });
      expect(
        response.body.data.every((row: { missing: boolean }) => row.missing),
      ).toBe(true);
    });

    it('propagates a missing base price to a derived tier', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/price-tiers/${partnerTierId}/prices?type=dish&q=${UNPRICED_DISH_SKU}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body.data[0]).toMatchObject({
        missing: true,
        effectivePriceCents: null,
      });
    });

    it('searches and paginates server-side', async () => {
      const searched = await request(app.getHttpServer())
        .get(`/api/price-tiers/${standardTierId}/prices?type=dish&q=wrap`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(searched.body.data).toHaveLength(1);
      expect(searched.body.data[0].reference).toBe('FK-WRAP-001');

      const firstPage = await request(app.getHttpServer())
        .get(`/api/price-tiers/${standardTierId}/prices?type=dish&limit=1&page=1`)
        .set('Cookie', adminCookie)
        .expect(200);
      const secondPage = await request(app.getHttpServer())
        .get(`/api/price-tiers/${standardTierId}/prices?type=dish&limit=1&page=2`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(firstPage.body.data).toHaveLength(1);
      expect(firstPage.body.meta.limit).toBe(1);
      expect(secondPage.body.data[0].itemId).not.toBe(
        firstPage.body.data[0].itemId,
      );
    });

    it('lists option prices too', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/price-tiers/${standardTierId}/prices?type=option&limit=100`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].itemType).toBe('option');
    });
  });

  describe('bulk overrides', () => {
    it('sets an override and then clears it back to the derived price', async () => {
      await request(app.getHttpServer())
        .put(`/api/price-tiers/${enterpriseTierId}/prices`)
        .set('Cookie', adminCookie)
        .send({
          prices: [
            { itemType: 'dish', itemId: pricedDishId, priceCents: 1_250 },
          ],
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual({ updated: 1, cleared: 0 });
        });

      const overridden = await request(app.getHttpServer())
        .get(`/api/price-tiers/${enterpriseTierId}/prices?type=dish&q=${PRICED_DISH_SKU}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(overridden.body.data[0]).toMatchObject({
        overrideCents: 1_250,
        effectivePriceCents: 1_250,
        derivedPriceCents: 2_115,
        source: 'EXPLICIT',
      });

      await request(app.getHttpServer())
        .put(`/api/price-tiers/${enterpriseTierId}/prices`)
        .set('Cookie', adminCookie)
        .send({
          prices: [{ itemType: 'dish', itemId: pricedDishId, priceCents: null }],
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual({ updated: 0, cleared: 1 });
        });

      const cleared = await request(app.getHttpServer())
        .get(`/api/price-tiers/${enterpriseTierId}/prices?type=dish&q=${PRICED_DISH_SKU}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(cleared.body.data[0]).toMatchObject({
        overrideCents: null,
        effectivePriceCents: 2_115,
        source: 'DERIVED',
      });
    });

    it('prices a previously missing dish', async () => {
      await request(app.getHttpServer())
        .put(`/api/price-tiers/${standardTierId}/prices`)
        .set('Cookie', adminCookie)
        .send({
          prices: [
            { itemType: 'dish', itemId: unpricedDishId, priceCents: 1_575 },
          ],
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/price-tiers/${standardTierId}/prices?type=dish&q=${UNPRICED_DISH_SKU}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body.data[0]).toMatchObject({
        missing: false,
        effectivePriceCents: 1_575,
      });
    });

    it('rejects a negative price', async () => {
      await request(app.getHttpServer())
        .put(`/api/price-tiers/${standardTierId}/prices`)
        .set('Cookie', adminCookie)
        .send({
          prices: [
            { itemType: 'dish', itemId: pricedDishId, priceCents: -100 },
          ],
        })
        .expect(400);
    });

    it('rejects a fractional price', async () => {
      await request(app.getHttpServer())
        .put(`/api/price-tiers/${standardTierId}/prices`)
        .set('Cookie', adminCookie)
        .send({
          prices: [
            { itemType: 'dish', itemId: pricedDishId, priceCents: 10.5 },
          ],
        })
        .expect(400);
    });

    it('rejects a price for an unknown dish', async () => {
      await request(app.getHttpServer())
        .put(`/api/price-tiers/${standardTierId}/prices`)
        .set('Cookie', adminCookie)
        .send({
          prices: [
            {
              itemType: 'dish',
              itemId: '00000000-0000-4000-8000-000000000000',
              priceCents: 100,
            },
          ],
        })
        .expect(400);
    });
  });
});
