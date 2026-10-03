import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { ROLES } from '../src/auth/permissions.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SEED_PASSWORD } from '../prisma/seed.js';

const SUFFIX = Date.now();
const NEW_STAFF_EMAIL = `step5.chef.${SUFFIX}@test.com`;
const NEW_STAFF_CODE = `CHEF-${SUFFIX}`;

describe('Staff management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let kitchenCookie: string;
  let adminId: string;
  let kitchenRoleId: string;
  let driverRoleId: string;
  let createdStaffId: string;

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

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@test.com' },
      select: { id: true },
    });
    adminId = admin.id;

    kitchenRoleId = (
      await prisma.role.findUniqueOrThrow({
        where: { name: ROLES.KITCHEN },
        select: { id: true },
      })
    ).id;
    driverRoleId = (
      await prisma.role.findUniqueOrThrow({
        where: { name: ROLES.DRIVER },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.staff.deleteMany({ where: { staffCode: NEW_STAFF_CODE } });
    await prisma.user.deleteMany({ where: { email: NEW_STAFF_EMAIL } });
    await app.close();
  });

  describe('authorization', () => {
    it('rejects an unauthenticated caller with 401', async () => {
      await request(app.getHttpServer()).get('/api/staff').expect(401);
    });

    it('rejects a non-admin caller with 403 on every endpoint', async () => {
      const denied = await request(app.getHttpServer())
        .get('/api/staff')
        .set('Cookie', kitchenCookie)
        .expect(403);

      expect(denied.body.code).toBe('INSUFFICIENT_PERMISSIONS');

      await request(app.getHttpServer())
        .post('/api/staff')
        .set('Cookie', kitchenCookie)
        .send({
          email: 'blocked@test.com',
          password: SEED_PASSWORD,
          roleId: kitchenRoleId,
          staffCode: 'BLOCKED-1',
          fullName: 'Blocked Person',
        })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/staff/${adminId}/active`)
        .set('Cookie', kitchenCookie)
        .send({ active: false })
        .expect(403);
    });
  });

  describe('admin workflow', () => {
    it('lists staff with pagination metadata', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/staff?page=1&limit=2')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(2);
      expect(response.body.meta).toMatchObject({ page: 1, limit: 2 });
      expect(response.body.meta.total).toBeGreaterThanOrEqual(4);
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('rejects a limit above the maximum', async () => {
      await request(app.getHttpServer())
        .get('/api/staff?limit=1000')
        .set('Cookie', adminCookie)
        .expect(400);
    });

    it('creates a staff account without returning the password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/staff')
        .set('Cookie', adminCookie)
        .send({
          email: NEW_STAFF_EMAIL.toUpperCase(),
          password: SEED_PASSWORD,
          roleId: kitchenRoleId,
          staffCode: NEW_STAFF_CODE,
          fullName: 'Step Five Chef',
        })
        .expect(201);

      createdStaffId = response.body.id;

      expect(response.body.email).toBe(NEW_STAFF_EMAIL);
      expect(response.body.role.name).toBe(ROLES.KITCHEN);
      expect(response.body.active).toBe(true);
      expect(response.body.profile.staffCode).toBe(NEW_STAFF_CODE);
      expect(response.body).not.toHaveProperty('passwordHash');

      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: createdStaffId },
        select: { passwordHash: true },
      });
      expect(stored.passwordHash).not.toBe(SEED_PASSWORD);
      expect(stored.passwordHash.startsWith('$2')).toBe(true);
    });

    it('lets the new account authenticate', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: NEW_STAFF_EMAIL, password: SEED_PASSWORD })
        .expect(200);
    });

    it('rejects a duplicate email with 409', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/staff')
        .set('Cookie', adminCookie)
        .send({
          email: NEW_STAFF_EMAIL,
          password: SEED_PASSWORD,
          roleId: kitchenRoleId,
          staffCode: `${NEW_STAFF_CODE}-DUP`,
          fullName: 'Duplicate Chef',
        })
        .expect(409);

      expect(response.body.code).toBe('STAFF_EMAIL_ALREADY_EXISTS');
    });

    it('rejects an invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/staff')
        .set('Cookie', adminCookie)
        .send({
          email: 'not-an-email',
          password: SEED_PASSWORD,
          roleId: kitchenRoleId,
          staffCode: 'BAD-1',
          fullName: 'Bad Email',
        })
        .expect(400);
    });

    it('rejects an unknown role with 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/staff')
        .set('Cookie', adminCookie)
        .send({
          email: `step5.norole.${SUFFIX}@test.com`,
          password: SEED_PASSWORD,
          roleId: '00000000-0000-4000-8000-000000000000',
          staffCode: 'NOROLE-1',
          fullName: 'No Role',
        })
        .expect(400);

      expect(response.body.code).toBe('ROLE_NOT_FOUND');
    });

    it('reads one staff account and 404s for an unknown id', async () => {
      await request(app.getHttpServer())
        .get(`/api/staff/${createdStaffId}`)
        .set('Cookie', adminCookie)
        .expect(200);

      const missing = await request(app.getHttpServer())
        .get('/api/staff/00000000-0000-4000-8000-000000000000')
        .set('Cookie', adminCookie)
        .expect(404);

      expect(missing.body.code).toBe('STAFF_NOT_FOUND');
    });

    it('updates profile fields only', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/staff/${createdStaffId}`)
        .set('Cookie', adminCookie)
        .send({ jobTitle: 'Sous chef' })
        .expect(200);

      expect(response.body.profile.jobTitle).toBe('Sous chef');
      expect(response.body.email).toBe(NEW_STAFF_EMAIL);

      await request(app.getHttpServer())
        .patch(`/api/staff/${createdStaffId}`)
        .set('Cookie', adminCookie)
        .send({ email: 'hijack@test.com' })
        .expect(400);
    });

    it('changes the role', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/staff/${createdStaffId}/role`)
        .set('Cookie', adminCookie)
        .send({ roleId: driverRoleId })
        .expect(200);

      expect(response.body.role.name).toBe(ROLES.DRIVER);
    });

    it('deactivates and reactivates an account', async () => {
      const deactivated = await request(app.getHttpServer())
        .patch(`/api/staff/${createdStaffId}/active`)
        .set('Cookie', adminCookie)
        .send({ active: false })
        .expect(200);

      expect(deactivated.body.active).toBe(false);

      // Step 4's guard re-reads the account, so a deactivated user cannot log in.
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: NEW_STAFF_EMAIL, password: SEED_PASSWORD })
        .expect(401);

      const reactivated = await request(app.getHttpServer())
        .patch(`/api/staff/${createdStaffId}/active`)
        .set('Cookie', adminCookie)
        .send({ active: true })
        .expect(200);

      expect(reactivated.body.active).toBe(true);
    });
  });

  describe('self-protection', () => {
    it('refuses to let an admin deactivate themselves', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/staff/${adminId}/active`)
        .set('Cookie', adminCookie)
        .send({ active: false })
        .expect(403);

      expect(response.body.code).toBe('SELF_DEACTIVATION_FORBIDDEN');

      const admin = await prisma.user.findUniqueOrThrow({
        where: { id: adminId },
        select: { active: true },
      });
      expect(admin.active).toBe(true);
    });

    it('refuses to let an admin drop their own staff-management capability', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/staff/${adminId}/role`)
        .set('Cookie', adminCookie)
        .send({ roleId: kitchenRoleId })
        .expect(403);

      expect(response.body.code).toBe('SELF_ROLE_DOWNGRADE_FORBIDDEN');

      const admin = await prisma.user.findUniqueOrThrow({
        where: { id: adminId },
        select: { role: { select: { name: true } } },
      });
      expect(admin.role.name).toBe(ROLES.ADMIN);
    });
  });
});
