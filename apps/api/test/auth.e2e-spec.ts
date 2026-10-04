import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { RequirePermissions } from '../src/auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../src/auth/permissions.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { SEED_PASSWORD } from '../prisma/seed.js';

/**
 * Test-only routes. They exist so guard behaviour can be proven over HTTP
 * before any business module exists; they are not part of the application.
 */
@Controller('probe')
class ProbeController {
  @Get('kitchen')
  @RequirePermissions(PERMISSIONS.KITCHEN_UPDATE)
  kitchen() {
    return { ok: true };
  }

  @Get('dispatch')
  @RequirePermissions(PERMISSIONS.DISPATCH_MANAGE)
  dispatch() {
    return { ok: true };
  }

  @Get('dispatch-and-orders')
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW, PERMISSIONS.DISPATCH_MANAGE)
  dispatchAndOrders() {
    return { ok: true };
  }
}

describe('Authentication and RBAC (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: SEED_PASSWORD })
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];

    return cookies.find((cookie) => cookie.startsWith(AUTH_COOKIE_NAME))!;
  }

  describe('login', () => {
    it('accepts valid credentials and sets an httpOnly cookie', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: SEED_PASSWORD })
        .expect(200);

      const cookie = (response.headers['set-cookie'] as unknown as string[])[0];

      expect(cookie).toContain(`${AUTH_COOKIE_NAME}=`);
      expect(cookie.toLowerCase()).toContain('httponly');
      expect(cookie.toLowerCase()).toContain('samesite=lax');

      expect(response.body).toMatchObject({
        email: 'admin@test.com',
        roleName: 'Admin',
      });
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('accessToken');
    });

    it('rejects a wrong password with 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'Wrong@1234' })
        .expect(401);

      expect(response.body.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.requestId).toBeDefined();
    });

    it('rejects an unknown email with the same 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: SEED_PASSWORD })
        .expect(401);

      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('protected routes', () => {
    it('returns 401 without a token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.code).toBe('UNAUTHENTICATED');
    });

    it('returns 401 for a garbage token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', `${AUTH_COOKIE_NAME}=not-a-jwt`)
        .expect(401);

      expect(response.body.code).toBe('INVALID_TOKEN');
    });

    it('returns the caller and their permissions when authenticated', async () => {
      const cookie = await login('kitchen@test.com');

      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.email).toBe('kitchen@test.com');
      expect(response.body.roleName).toBe('Kitchen');
      expect(response.body.permissions).toEqual(
        expect.arrayContaining(['kitchen.update', 'orders.view']),
      );
      expect(response.body.permissions).not.toContain('dispatch.manage');
    });

    it('leaves the health endpoint public', async () => {
      await request(app.getHttpServer()).get('/api/health').expect(200);
    });
  });

  describe('permission isolation across the four staff accounts', () => {
    it('lets Admin through every probe route', async () => {
      const cookie = await login('admin@test.com');

      await request(app.getHttpServer())
        .get('/api/probe/kitchen')
        .set('Cookie', cookie)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/probe/dispatch')
        .set('Cookie', cookie)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/probe/dispatch-and-orders')
        .set('Cookie', cookie)
        .expect(200);
    });

    it('allows Kitchen only in the kitchen', async () => {
      const cookie = await login('kitchen@test.com');

      await request(app.getHttpServer())
        .get('/api/probe/kitchen')
        .set('Cookie', cookie)
        .expect(200);

      const denied = await request(app.getHttpServer())
        .get('/api/probe/dispatch')
        .set('Cookie', cookie)
        .expect(403);

      expect(denied.body.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(denied.body.details).toEqual({
        requiredPermissions: ['dispatch.manage'],
      });
    });

    it('allows Dispatch only in dispatch, including multi-permission routes', async () => {
      const cookie = await login('dispatch@test.com');

      await request(app.getHttpServer())
        .get('/api/probe/dispatch')
        .set('Cookie', cookie)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/probe/dispatch-and-orders')
        .set('Cookie', cookie)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/probe/kitchen')
        .set('Cookie', cookie)
        .expect(403);
    });

    it('denies Driver both kitchen and dispatch routes', async () => {
      const cookie = await login('driver@test.com');

      await request(app.getHttpServer())
        .get('/api/probe/kitchen')
        .set('Cookie', cookie)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/probe/dispatch')
        .set('Cookie', cookie)
        .expect(403);

      const profile = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(profile.body.permissions.sort()).toEqual([
  'driver.update',
  'driver.view',
  'profile.read',
]);
    });
  });

  describe('logout', () => {
    it('clears the cookie', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .expect(204);

      const cookie = (response.headers['set-cookie'] as unknown as string[])[0];

      expect(cookie).toContain(`${AUTH_COOKIE_NAME}=;`);
      expect(cookie.toLowerCase()).toContain('httponly');
    });
  });

  describe('P0-6 management permission isolation', () => {
    it.each(['kitchen@test.com', 'dispatch@test.com', 'driver@test.com'])(
      '%s cannot invoke catalogue, menu, billing or dispatch management without its permission',
      async (email) => {
        const cookie = await login(email);
        for (const path of ['/api/dishes', '/api/menu/categories', '/api/invoices']) {
          const response = await request(app.getHttpServer())
            .post(path).set('Cookie', cookie).send({}).expect(403);
          expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
        }
        if (email !== 'dispatch@test.com') {
          await request(app.getHttpServer())
            .post('/api/dispatch/drops/00000000-0000-4000-8000-000000000000/assign-driver')
            .set('Cookie', cookie).send({}).expect(403);
        }
      },
    );

    it('Admin holds all three management capabilities and can load eligible drivers', async () => {
      const cookie = await login('admin@test.com');
      const profile = await request(app.getHttpServer())
        .get('/api/auth/me').set('Cookie', cookie).expect(200);
      expect(profile.body.permissions).toEqual(expect.arrayContaining([
        'catalogue.manage', 'menu.manage', 'billing.manage',
      ]));
      const drivers = await request(app.getHttpServer())
        .get('/api/companies/eligible-drivers').set('Cookie', cookie).expect(200);
      expect(drivers.body.length).toBeGreaterThan(0);
    });

    it('documents the pending Dispatch driver-list mismatch without granting companies.view', async () => {
      const cookie = await login('dispatch@test.com');
      const profile = await request(app.getHttpServer())
        .get('/api/auth/me').set('Cookie', cookie).expect(200);
      expect(profile.body.permissions).toContain('dispatch.manage');
      expect(profile.body.permissions).not.toContain('companies.view');
      const denied = await request(app.getHttpServer())
        .get('/api/companies/eligible-drivers').set('Cookie', cookie).expect(403);
      expect(denied.body.details.requiredPermissions).toEqual(['companies.view']);
    });
  });
});
