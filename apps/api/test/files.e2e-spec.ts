import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { MAX_FILE_BYTES } from '../src/files/files.errors.js';

describe('Files (e2e)', () => {
  let app: INestApplication;
  let adminCookie: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: SEED_PASSWORD })
      .expect(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    adminCookie = cookies.find((cookie) => cookie.startsWith(AUTH_COOKIE_NAME))!;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a file larger than 2 MB', async () => {
    await request(app.getHttpServer())
      .post('/api/files')
      .set('Cookie', adminCookie)
      .attach('file', Buffer.alloc(MAX_FILE_BYTES + 1), {
        filename: 'big.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('FILE_TOO_LARGE');
      });
  });

  it('rejects a non-image file', async () => {
    await request(app.getHttpServer())
      .post('/api/files')
      .set('Cookie', adminCookie)
      .attach('file', Buffer.from('%PDF-1.4'), {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('FILE_TYPE_NOT_ALLOWED');
      });
  });
});
