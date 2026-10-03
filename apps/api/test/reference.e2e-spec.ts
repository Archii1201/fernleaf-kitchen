import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const SUFFIX = Date.now();
const CODE = `REF-${SUFFIX}`;

describe('Reference data (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let createdId: string | undefined;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: SEED_PASSWORD })
      .expect(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    adminCookie = cookies.find((cookie) => cookie.startsWith(AUTH_COOKIE_NAME))!;
  });

  afterAll(async () => {
    if (createdId) {
      await prisma.allergen.deleteMany({ where: { id: createdId } });
    }
    await app.close();
  });

  it('rejects a duplicate code with 409 and keeps a deactivated row readable', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/reference/allergens')
      .set('Cookie', adminCookie)
      .send({ code: CODE, name: `Ref ${SUFFIX}` })
      .expect(201);

    createdId = created.body.id;

    await request(app.getHttpServer())
      .post('/api/reference/allergens')
      .set('Cookie', adminCookie)
      .send({ code: CODE, name: `Other ${SUFFIX}` })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('REFERENCE_ALREADY_EXISTS');
      });

    await request(app.getHttpServer())
      .patch(`/api/reference/allergens/${createdId}`)
      .set('Cookie', adminCookie)
      .send({ active: false })
      .expect(200);

    const listed = await request(app.getHttpServer())
      .get('/api/reference/allergens')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(listed.body.some((row: { id: string }) => row.id === createdId)).toBe(
      true,
    );
  });
});
