import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SEED_PASSWORD } from '../prisma/seed.js';

const SUFFIX = Date.now();
const DOMAIN_A = `northwind-${SUFFIX}.com`;
const DOMAIN_B = `contoso-${SUFFIX}.com`;

describe('Companies and employees (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let driverCookie: string;
  let priceTierId: string;
  let driverStaffId: string;
  let companyAId: string;
  let companyBId: string;
  let addressAId: string;
  let employeeId: string;
  let historicalOrderId: string | undefined;

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

    priceTierId = (
      await prisma.priceTier.findFirstOrThrow({
        where: { isDefault: true },
        select: { id: true },
      })
    ).id;
    driverStaffId = (
      await prisma.staff.findUniqueOrThrow({
        where: { staffCode: 'DRIVER-001' },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (historicalOrderId) {
      await prisma.order.deleteMany({ where: { id: historicalOrderId } });
    }

    await prisma.customerEmployee.deleteMany({
      where: { companyId: { in: [companyAId, companyBId].filter(Boolean) } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyAId, companyBId].filter(Boolean) } },
    });
    await app.close();
  });

  describe('authorization', () => {
    it('rejects anonymous access', async () => {
      await request(app.getHttpServer()).get('/api/companies').expect(401);
      await request(app.getHttpServer()).get('/api/employees').expect(401);
    });

    it('rejects a user without the companies permission', async () => {
      await request(app.getHttpServer())
        .get('/api/companies')
        .set('Cookie', driverCookie)
        .expect(403);
    });

    it('allows a user who holds the permission', async () => {
      await request(app.getHttpServer())
        .get('/api/companies')
        .set('Cookie', adminCookie)
        .expect(200);

      const drivers = await request(app.getHttpServer())
        .get('/api/companies/eligible-drivers')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(
        drivers.body.some(
          (driver: { staffCode: string }) => driver.staffCode === 'DRIVER-001',
        ),
      ).toBe(true);
    });
  });

  describe('company creation', () => {
    it('creates a company with domains, addresses and a working week', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/companies')
        .set('Cookie', adminCookie)
        .send({
          name: `Northwind ${SUFFIX}`,
          priceTierId,
          domains: [` @${DOMAIN_A.toUpperCase()} `],
          addresses: [
            {
              label: 'Head office',
              line1: '1 Residency Road',
              city: 'Bengaluru',
              postalCode: '560025',
            },
            {
              label: 'Annexe',
              line1: '2 Residency Road',
              city: 'Bengaluru',
              postalCode: '560025',
            },
          ],
          workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
          billingContactName: 'Bill Ops',
          billingContactEmail: `billing@${DOMAIN_A}`,
        })
        .expect(201);

      companyAId = response.body.id;
      addressAId = response.body.addresses.find(
        (address: { label: string }) => address.label === 'Head office',
      ).id;

      // The domain was normalized on the way in.
      expect(response.body.domains[0].domain).toBe(DOMAIN_A);
      expect(response.body.addresses).toHaveLength(2);
      expect(response.body.workingDays).toEqual([
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
      ]);
      expect(response.body.billingContact.name).toBe('Bill Ops');
      expect(response.body.deliveryDefaults.leaveKitchenMinutes).toBe(60);
    });

    it('creates the second company used by the move test', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/companies')
        .set('Cookie', adminCookie)
        .send({
          name: `Contoso ${SUFFIX}`,
          priceTierId,
          domains: [DOMAIN_B, DOMAIN_A.replace('.com', '.net')],
        })
        .expect(201);

      companyBId = response.body.id;
    });

    it('rejects missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/companies')
        .set('Cookie', adminCookie)
        .send({ name: `No tier ${SUFFIX}` })
        .expect(400);
    });

    it('rejects a public email domain', async () => {
      await request(app.getHttpServer())
        .post('/api/companies')
        .set('Cookie', adminCookie)
        .send({
          name: `Public ${SUFFIX}`,
          priceTierId,
          domains: ['gmail.com'],
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body.code).toBe('PUBLIC_EMAIL_DOMAIN');
        });
    });

    it('rejects an unknown price tier', async () => {
      await request(app.getHttpServer())
        .post('/api/companies')
        .set('Cookie', adminCookie)
        .send({
          name: `Bad tier ${SUFFIX}`,
          priceTierId: '00000000-0000-4000-8000-000000000000',
          domains: [`other-${SUFFIX}.com`],
        })
        .expect(404);
    });
  });

  describe('company domains', () => {
    it('rejects a domain that already belongs to another company', async () => {
      await request(app.getHttpServer())
        .post(`/api/companies/${companyBId}/domains`)
        .set('Cookie', adminCookie)
        .send({ domain: DOMAIN_A })
        .expect(409)
        .expect(({ body }) => {
          expect(body.code).toBe('COMPANY_DOMAIN_ALREADY_USED');
        });
    });

    it('rejects a domain the company already has', async () => {
      await request(app.getHttpServer())
        .post(`/api/companies/${companyAId}/domains`)
        .set('Cookie', adminCookie)
        .send({ domain: DOMAIN_A.toUpperCase() })
        .expect(409)
        .expect(({ body }) => {
          expect(body.code).toBe('DUPLICATE_COMPANY_DOMAIN');
        });
    });

    it('refuses to remove the only domain', async () => {
      const domains = await request(app.getHttpServer())
        .get(`/api/companies/${companyAId}/domains`)
        .set('Cookie', adminCookie)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/companies/${companyAId}/domains/${domains.body[0].id}`)
        .set('Cookie', adminCookie)
        .expect(400);
    });

    it('adds and removes an extra domain', async () => {
      const added = await request(app.getHttpServer())
        .post(`/api/companies/${companyAId}/domains`)
        .set('Cookie', adminCookie)
        .send({ domain: `alt-${SUFFIX}.com` })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/companies/${companyAId}/domains/${added.body.id}`)
        .set('Cookie', adminCookie)
        .expect(204);
    });

    it('is protected by the manage permission', async () => {
      await request(app.getHttpServer())
        .post(`/api/companies/${companyAId}/domains`)
        .set('Cookie', driverCookie)
        .send({ domain: `nope-${SUFFIX}.com` })
        .expect(403);
    });
  });

  describe('calendar, delivery defaults and price tier', () => {
    it('replaces the company working week', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/companies/${companyAId}/calendar`)
        .set('Cookie', adminCookie)
        .send({ workingDays: ['TUESDAY', 'MONDAY'] })
        .expect(200);

      expect(response.body.workingDays).toEqual(['MONDAY', 'TUESDAY']);
    });

    it('rejects an invalid weekday', async () => {
      await request(app.getHttpServer())
        .put(`/api/companies/${companyAId}/calendar`)
        .set('Cookie', adminCookie)
        .send({ workingDays: ['FUNDAY'] })
        .expect(400);
    });

    it('adds and removes a company holiday', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/companies/${companyAId}/holidays`)
        .set('Cookie', adminCookie)
        .send({ date: '2031-01-26', name: 'Republic Day' })
        .expect(201);

      expect(created.body.date).toBe('2031-01-26');

      const calendar = await request(app.getHttpServer())
        .get(`/api/companies/${companyAId}/calendar`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(calendar.body.holidays).toHaveLength(1);

      await request(app.getHttpServer())
        .delete(`/api/companies/${companyAId}/holidays/${created.body.id}`)
        .set('Cookie', adminCookie)
        .expect(204);
    });

    it('saves delivery defaults including an eligible default driver', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/companies/${companyAId}/delivery-defaults`)
        .set('Cookie', adminCookie)
        .send({
          defaultAddressId: addressAId,
          defaultDeliveryTime: '12:30',
          leaveKitchenMinutes: 45,
          driverInstructions: 'Use the service lift.',
          defaultDriverStaffId: driverStaffId,
        })
        .expect(200);

      expect(response.body.deliveryDefaults).toMatchObject({
        defaultDeliveryTime: '12:30',
        leaveKitchenMinutes: 45,
        driverInstructions: 'Use the service lift.',
      });
      expect(response.body.deliveryDefaults.defaultDriver.id).toBe(
        driverStaffId,
      );
    });

    it('rejects negative leave-kitchen minutes', async () => {
      await request(app.getHttpServer())
        .patch(`/api/companies/${companyAId}/delivery-defaults`)
        .set('Cookie', adminCookie)
        .send({ leaveKitchenMinutes: -5 })
        .expect(400);
    });

    it('rejects a staff member who cannot perform delivery work', async () => {
      const kitchenStaff = await prisma.staff.findUniqueOrThrow({
        where: { staffCode: 'KITCHEN-001' },
        select: { id: true },
      });

      await request(app.getHttpServer())
        .patch(`/api/companies/${companyAId}/delivery-defaults`)
        .set('Cookie', adminCookie)
        .send({ defaultDriverStaffId: kitchenStaff.id })
        .expect(400)
        .expect(({ body }) => {
          expect(body.code).toBe('DRIVER_NOT_ELIGIBLE');
        });
    });

    it('assigns a price tier', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/companies/${companyAId}/price-tier`)
        .set('Cookie', adminCookie)
        .send({ priceTierId })
        .expect(200);

      expect(response.body.priceTier.id).toBe(priceTierId);
    });

    it('clears the company tier so default pricing applies', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/companies')
        .set('Cookie', adminCookie)
        .send({
          name: `No tier ${SUFFIX}`,
          domains: [`notier-${SUFFIX}.com`],
        })
        .expect(201);

      expect(created.body.priceTier).toBeNull();

      await request(app.getHttpServer())
        .patch(`/api/companies/${created.body.id}/price-tier`)
        .set('Cookie', adminCookie)
        .send({ priceTierId: null })
        .expect(200)
        .expect(({ body }) => {
          expect(body.priceTier).toBeNull();
        });

      const menu = await request(app.getHttpServer())
        .get(`/api/menu?companyId=${created.body.id}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(menu.body.priceTier.code).toBe('STANDARD');

      await prisma.company.deleteMany({ where: { id: created.body.id } });
    });
  });

  describe('menu visibility', () => {
    it('stores hidden dishes without touching the catalogue', async () => {
      const dish = await prisma.dish.findFirstOrThrow({
        select: { id: true },
      });

      const response = await request(app.getHttpServer())
        .put(`/api/companies/${companyAId}/menu-visibility`)
        .set('Cookie', adminCookie)
        .send({ hiddenCategoryIds: [], hiddenDishIds: [dish.id] })
        .expect(200);

      expect(response.body.hiddenDishes).toHaveLength(1);
      // The dish itself still exists and is untouched.
      await expect(
        prisma.dish.findUnique({ where: { id: dish.id } }),
      ).resolves.not.toBeNull();

      await request(app.getHttpServer())
        .put(`/api/companies/${companyAId}/menu-visibility`)
        .set('Cookie', adminCookie)
        .send({ hiddenCategoryIds: [], hiddenDishIds: [] })
        .expect(200);
    });

    it('rejects an unknown dish id', async () => {
      await request(app.getHttpServer())
        .put(`/api/companies/${companyAId}/menu-visibility`)
        .set('Cookie', adminCookie)
        .send({
          hiddenCategoryIds: [],
          hiddenDishIds: ['00000000-0000-4000-8000-000000000000'],
        })
        .expect(400);
    });
  });

  describe('employees', () => {
    it('creates an employee on an approved company domain', async () => {
      const allergen = await prisma.allergen.findFirstOrThrow({
        select: { id: true },
      });

      const response = await request(app.getHttpServer())
        .post('/api/employees')
        .set('Cookie', adminCookie)
        .send({
          companyId: companyAId,
          email: `Alice@${DOMAIN_A.toUpperCase()} `,
          fullName: 'Alice Mehta',
          defaultAddressId: addressAId,
          canChooseAddress: true,
          canChooseDeliveryTime: true,
          allergenIds: [allergen.id],
          dietaryNotes: 'Prefers light meals',
        })
        .expect(201);

      employeeId = response.body.id;
      expect(response.body.email).toBe(`alice@${DOMAIN_A}`);
      expect(response.body.company.id).toBe(companyAId);
      expect(response.body.deliveryPermissions).toEqual({
        canChooseAddress: true,
        canChooseDeliveryTime: true,
        canChoosePackaging: false,
      });
      expect(response.body.allergens).toHaveLength(1);
    });

    it('rejects an email outside the approved domains', async () => {
      await request(app.getHttpServer())
        .post('/api/employees')
        .set('Cookie', adminCookie)
        .send({
          companyId: companyAId,
          email: `bob@gmail.com`,
          fullName: 'Bob Public',
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body.code).toBe('EMPLOYEE_DOMAIN_NOT_APPROVED');
        });
    });

    it('rejects an invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/employees')
        .set('Cookie', adminCookie)
        .send({ companyId: companyAId, email: 'not-an-email', fullName: 'X' })
        .expect(400);
    });

    it('rejects a duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/employees')
        .set('Cookie', adminCookie)
        .send({
          companyId: companyAId,
          email: `alice@${DOMAIN_A}`,
          fullName: 'Alice Again',
        })
        .expect(409);
    });

    it('rejects an unknown company', async () => {
      await request(app.getHttpServer())
        .post('/api/employees')
        .set('Cookie', adminCookie)
        .send({
          companyId: '00000000-0000-4000-8000-000000000000',
          email: `ghost@${DOMAIN_A}`,
          fullName: 'Ghost',
        })
        .expect(404);
    });

    it('filters by company and paginates', async () => {
      const filtered = await request(app.getHttpServer())
        .get(`/api/employees?companyId=${companyAId}&limit=10`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(filtered.body.meta).toMatchObject({ page: 1, limit: 10 });
      expect(
        filtered.body.data.every(
          (employee: { company: { id: string } }) =>
            employee.company.id === companyAId,
        ),
      ).toBe(true);

      const other = await request(app.getHttpServer())
        .get(`/api/employees?companyId=${companyBId}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(other.body.data).toHaveLength(0);
    });

    it('updates delivery permissions', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/employees/${employeeId}`)
        .set('Cookie', adminCookie)
        .send({ canChoosePackaging: true })
        .expect(200);

      expect(response.body.deliveryPermissions.canChoosePackaging).toBe(true);
    });

    it('validates the company owner belongs to the company', async () => {
      await request(app.getHttpServer())
        .patch(`/api/companies/${companyBId}`)
        .set('Cookie', adminCookie)
        .send({ ownerEmployeeId: employeeId })
        .expect(409)
        .expect(({ body }) => {
          expect(body.code).toBe('COMPANY_OWNER_INVALID');
        });

      await request(app.getHttpServer())
        .patch(`/api/companies/${companyAId}`)
        .set('Cookie', adminCookie)
        .send({ ownerEmployeeId: employeeId })
        .expect(200);

      // Unset again so the employee is free to move in the next block.
      await prisma.company.update({
        where: { id: companyAId },
        data: { ownerEmployeeId: null },
      });
    });
  });

  describe('moving an employee preserves order history', () => {
    it('keeps a historical order attached to the original company', async () => {
     const order = await prisma.order.create({
  data: {
    orderNumber: `E2E-${SUFFIX}`,

    company: {
      connect: {
        id: companyAId,
      },
    },

    customerEmployee: {
      connect: {
        id: employeeId,
      },
    },

    deliveryDate: new Date('2031-03-04T00:00:00Z'),
    deliveryTime: new Date('1970-01-01T12:30:00Z'),

    deliveryAddress: {
      connect: {
        id: addressAId,
      },
    },

    deliveryAddressLabel: 'Head office',
    deliveryAddressLine1: '1 Residency Road',
    deliveryAddressCity: 'Bengaluru',
    deliveryAddressPostalCode: '560025',
    deliveryAddressCountry: 'IN',

    priceTier: {
      connect: {
        id: priceTierId,
      },
    },

    priceTierName: 'Standard',
      leaveKitchenMinutes: 60,
  },
  select: {
    id: true,
    companyId: true,
  },
});

      historicalOrderId = order.id;

      // Company B also owns DOMAIN_A's sibling, so Alice's address stays valid
      // only if her new company approves her email domain; add it first.
      await request(app.getHttpServer())
        .post(`/api/companies/${companyBId}/domains`)
        .set('Cookie', adminCookie)
        .send({ domain: `alice-move-${SUFFIX}.com` })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/employees/${employeeId}`)
        .set('Cookie', adminCookie)
        .send({
          companyId: companyBId,
          email: `alice@alice-move-${SUFFIX}.com`,
        })
        .expect(200)
        .expect(({ body }) => {
          // Future behaviour uses the new company.
          expect(body.company.id).toBe(companyBId);
          expect(body.defaultAddress).toBeNull();
        });

      const afterMove = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: {
          companyId: true,
          customerEmployeeId: true,
          deliveryAddressId: true,
          deliveryAddressLabel: true,
        },
      });

      // Historical order data is not rewritten.
      expect(afterMove.companyId).toBe(companyAId);
      expect(afterMove.customerEmployeeId).toBe(employeeId);
      expect(afterMove.deliveryAddressId).toBe(addressAId);
      expect(afterMove.deliveryAddressLabel).toBe('Head office');
    });

    it('lists the employee under the new company only', async () => {
      const newCompany = await request(app.getHttpServer())
        .get(`/api/employees?companyId=${companyBId}`)
        .set('Cookie', adminCookie)
        .expect(200);
      const oldCompany = await request(app.getHttpServer())
        .get(`/api/employees?companyId=${companyAId}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(
        newCompany.body.data.some(
          (employee: { id: string }) => employee.id === employeeId,
        ),
      ).toBe(true);
      expect(oldCompany.body.data).toHaveLength(0);
    });
  });

  describe('database integrity', () => {
    it('refuses a duplicate domain at the database level too', async () => {
      await expect(
        prisma.companyDomain.create({
          data: { companyId: companyBId, domain: DOMAIN_A },
        }),
      ).rejects.toThrow();
    });
  });
});
