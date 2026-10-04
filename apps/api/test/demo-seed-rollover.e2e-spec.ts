import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createSeedClient, seedAll, seedIfNeeded, STAFF_ACCOUNTS, SEED_PASSWORD, type SeedClient } from '../prisma/seed.js';
import { seedTime, transactionSeedClient } from '../prisma/seed-runtime.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { DemoMaintenanceService } from '../src/demo/demo-maintenance.service.js';
import { CLOCK, FixedClock } from '../src/kitchen/time/clock.js';
import { KitchenTime } from '../src/kitchen/time/kitchen-time.js';
import { MenuContextLoader } from '../src/menu/menu-context.loader.js';
import { MenuResolver } from '../src/menu/menu.resolver.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { DEMO_ORDER_NUMBERS, reserveDemoCompanies, RICH_DOMAINS } from './demo-seed.fixture.js';

const options = { now: new Date('2031-03-04T20:00:00Z'), timeZone: 'Asia/Kolkata' }; // UTC 4th, business date 5th.
const invoiceNumbers = ['DEMO-INV-ISSUED', 'DEMO-INV-PAID', 'DEMO-INV-VOID'];
const rollback = new Error('P0-8 rollback-only fixture');

describe('P0-8 normal seed and date rollover (real PostgreSQL)', () => {
  let prisma: SeedClient;
  let db: SeedClient;
  let app: INestApplication;
  let transaction: Promise<void>;
  let finish: () => void;
  let transactionError: unknown;
  let cookie: string;
  const clock = new FixedClock(options.now);
  const time = seedTime(options);
  const seededWhere = { OR: [{ orderNumber: { in: DEMO_ORDER_NUMBERS } }, { orderNumber: { startsWith: 'DEMO-REVIEW-' } }] };
  const snapshot = () => db.order.findMany({ where: seededWhere, orderBy: { orderNumber: 'asc' }, include: {
    lines: { include: { combinations: { include: { options: true } } } }, prepUnits: true,
    dropOrder: { include: { drop: true } }, invoice: { include: { lines: true, credits: true } },
  } });
  const counts = async () => ({
    users: await db.user.count(), companies: await db.company.count(), employees: await db.customerEmployee.count(),
    dishes: await db.dish.count(), categories: await db.menuCategory.count(), options: await db.option.count(),
    groups: await db.optionGroup.count(), orders: await db.order.count(), drops: await db.drop.count(),
    invoices: await db.invoice.count(), credits: await db.orderCredit.count(), tiers: await db.priceTier.count(),
  });

  beforeAll(async () => {
    prisma = createSeedClient();
    let ready!: () => void;
    let fail!: (error: unknown) => void;
    const seeded = new Promise<void>((resolve, reject) => { ready = resolve; fail = reject; });
    const held = new Promise<void>((resolve) => { finish = resolve; });
    transaction = prisma.$transaction(async (tx) => {
      db = transactionSeedClient(tx);
      const oldOrders = await tx.order.findMany({ where: seededWhere });
      for (const row of oldOrders) await tx.order.update({ where: { id: row.id }, data: { orderNumber: `P08-preserved-${row.id}` } });
      const oldInvoices = await tx.invoice.findMany({ where: { invoiceNumber: { in: invoiceNumbers } } });
      for (const row of oldInvoices) await tx.invoice.update({ where: { id: row.id }, data: { invoiceNumber: `P08-preserved-${row.id}` } });
      await reserveDemoCompanies(tx, ['northwind.com', 'contoso.com', ...RICH_DOMAINS, 'fernleaf-demo.test']);
      const oldKeys = await tx.demoOwnedRecord.findMany({ where: { key: { startsWith: 'demo:review:' } } });
      for (const row of oldKeys) await tx.demoOwnedRecord.update({ where: { key: row.key }, data: { key: `P08-preserved:${row.key}` } });
      // Required credentials/profiles are created from scratch; other reviewer IDs/FKs remain intact.
      for (const account of STAFF_ACCOUNTS) {
        const user = await tx.user.findUnique({ where: { email: account.email } });
        if (user) await tx.user.update({ where: { id: user.id }, data: { email: `p08-preserved-${user.id}@example.test` } });
        const staff = await tx.staff.findUnique({ where: { staffCode: account.staffCode } });
        if (staff) await tx.staff.update({ where: { id: staff.id }, data: { staffCode: `P08-${staff.id}` } });
      }
      await seedAll(db, options); // The complete normal entry point, with no separate rich generator call.
      ready();
      await held;
      throw rollback;
    }, { timeout: 240_000, maxWait: 10_000 }).catch((error: unknown) => {
      if (error !== rollback) { transactionError = error; fail(error); }
    });
    await seeded;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(db)
      .overrideProvider(CLOCK).useValue(clock).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'driver@test.com', password: SEED_PASSWORD }).expect(200);
    cookie = (login.headers['set-cookie'] as unknown as string[]).find((value) => value.startsWith(AUTH_COOKIE_NAME))!;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    finish?.();
    await transaction;
    await prisma?.$disconnect();
    if (transactionError) throw transactionError;
  });

  it('creates exactly the four required hashed credentials and role/staff assignments', async () => {
    const rows = await db.user.findMany({ where: { email: { in: STAFF_ACCOUNTS.map((row) => row.email) } }, include: { role: true, staff: true } });
    expect(rows).toHaveLength(4);
    for (const account of STAFF_ACCOUNTS) {
      const user = rows.find((row) => row.email === account.email)!;
      expect(user.role.name).toBe(account.role);
      expect(user.staff?.staffCode).toBe(account.staffCode);
      expect(user.active).toBe(true);
      expect(user.passwordHash).not.toBe(SEED_PASSWORD);
      expect(await bcrypt.compare(SEED_PASSWORD, user.passwordHash)).toBe(true);
      await request(app.getHttpServer()).post('/api/auth/login').send({ email: account.email, password: SEED_PASSWORD }).expect(200);
    }
  });

  it('invokes rich data and creates companies/employees/catalogue/pricing and menu differences', async () => {
    expect(await db.order.count({ where: { orderNumber: { startsWith: 'RICH-' } } })).toBe(26);
    const companies = await db.company.findMany({ where: { domains: { some: { domain: { in: RICH_DOMAINS } } } }, include: { employees: true, addresses: true } });
    expect(companies).toHaveLength(6);
    expect(companies.every((row) => row.employees.length === 4 && row.addresses.length > 0)).toBe(true);
    expect(new Set(companies.map((row) => row.priceTierId)).size).toBe(3);
    expect(await db.dish.count()).toBeGreaterThanOrEqual(25);
    expect(await db.menuCategory.count()).toBeGreaterThan(3);
    expect(await db.optionGroup.count()).toBeGreaterThan(1);
    expect(await db.option.count()).toBeGreaterThan(3);
    const northwind = await db.companyDomain.findUniqueOrThrow({ where: { domain: 'northwind.com' } });
    const enterpriseCompany = await db.companyDomain.findUniqueOrThrow({ where: { domain: 'tatadigital.com' } });
    const special = await db.dish.findUniqueOrThrow({ where: { sku: 'FK-SPECIAL-001' } });
    const loader = app.get(MenuContextLoader);
    const resolver = app.get(MenuResolver);
    const standard = await loader.load({ companyId: northwind.companyId });
    const enterprise = await loader.load({ companyId: enterpriseCompany.companyId });
    expect(() => resolver.assertDishOrderable(standard, special.id)).toThrow();
    expect(resolver.assertDishOrderable(enterprise, special.id).priceCents).toBeGreaterThan(0);
  });

  it('uses business-local past/today/future dates and valid pre-booked cutoff/lifecycle snapshots', async () => {
    const rows = await snapshot();
    expect(rows).toHaveLength(33);
    const dates = rows.map((row) => time.toDateString(row.deliveryDate));
    expect(dates.some((date) => date < time.today())).toBe(true);
    expect(dates).toContain('2031-03-05');
    expect(dates.some((date) => date > time.today())).toBe(true);
    for (const row of rows) {
      expect(row.totalCents).toBe(row.lines.reduce((sum, line) => sum + line.lineTotalCents, 0));
      expect(Number.isSafeInteger(row.totalCents)).toBe(true);
      for (const line of row.lines) {
        expect(line.quantity).toBe(line.combinations.reduce((sum, combo) => sum + combo.quantity, 0));
        expect(line.lineTotalCents).toBe(line.combinations.reduce((sum, combo) => sum + combo.totalCents, 0));
        for (const combo of line.combinations) expect(combo.totalCents).toBe(combo.unitPriceCents * combo.quantity);
      }
      if (row.confirmedAt) expect(row.placedAt!.getTime()).toBeLessThan(row.confirmedAt.getTime());
      if (row.dropOrder) {
        const drop = row.dropOrder.drop;
        expect(drop.companyId).toBe(row.companyId);
        expect(drop.companyAddressId).toBe(row.deliveryAddressId);
        expect(drop.deliveryDate).toEqual(row.deliveryDate);
        expect(drop.deliveryTime).toEqual(row.deliveryTime);
        expect(drop.status).toBe(row.status);
        expect(row.prepUnits.every((unit) => unit.status === 'READY')).toBe(true);
      }
    }
  });

  it('exposes today’s assigned out-for-delivery Drop through authenticated driver list and dashboard', async () => {
    const row = await db.order.findUniqueOrThrow({ where: { orderNumber: 'DEMO-REVIEW-TODAY-2031-03-05' }, include: { dropOrder: { include: { drop: true } } } });
    const user = await db.user.findUniqueOrThrow({ where: { email: 'driver@test.com' }, include: { staff: true } });
    expect(row.dropOrder!.drop.driverStaffId).toBe(user.staff!.id);
    expect(row.status).toBe('OUT_FOR_DELIVERY');
    expect(time.toTimeString(row.deliveryTime)).toBe('14:30');
    expect(row.deliveryAddressLine1).toBe('21 Demo Park');
    const list = await request(app.getHttpServer()).get('/api/driver/drops/today').set('Cookie', cookie).expect(200);
    expect(list.body.date).toBe('2031-03-05');
    expect(list.body.drops).toContainEqual(expect.objectContaining({ id: row.dropOrder!.dropId, status: 'OUT_FOR_DELIVERY', deliveryTime: '14:30' }));
    const dashboard = await request(app.getHttpServer()).get('/api/dashboard/driver').set('Cookie', cookie).expect(200);
    expect(dashboard.body.date).toBe('2031-03-05');
    expect(dashboard.body.metrics.assigned).toBe(list.body.drops.length);
    expect(dashboard.body.metrics.remaining).toBeGreaterThan(0);
  });

  it('continues to reject a real new today order after cutoff despite pre-booked seed history', async () => {
    const employee = await db.customerEmployee.findUniqueOrThrow({ where: { email: 'meals@fernleaf-demo.test' } });
    const dish = await db.dish.findUniqueOrThrow({ where: { sku: 'FK-WRAP-001' } });
    const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    const before = await db.order.count();
    await expect(app.get(OrdersService).create({ customerEmployeeId: employee.id, deliveryDate: '2031-03-05',
      lines: [{ dishId: dish.id, quantity: 2, combinations: [{ quantity: 2 }] }],
    }, admin.id)).rejects.toThrow();
    expect(await db.order.count()).toBe(before);
  });

  it('reruns the complete entry point without duplicates or financial/workflow changes', async () => {
    const before = await counts();
    const snapshots = await snapshot();
    await seedAll(db, options);
    expect(await counts()).toEqual(before);
    expect(await snapshot()).toEqual(snapshots);
    expect(await seedIfNeeded(db, { ...options, force: false })).toEqual({ seeded: false });
    const invoices = await db.invoice.findMany({ where: { invoiceNumber: { in: invoiceNumbers } }, include: { lines: true, credits: true } });
    expect(invoices).toHaveLength(3);
    for (const invoice of invoices) {
      expect(invoice.totalCents).toBe(invoice.lines.reduce((sum, line) => sum + line.amountCents, 0));
      expect(invoice.creditCents).toBe(invoice.credits.reduce((sum, credit) => sum + credit.amountCents, 0));
    }
  }, 30_000);

  it('rolls to tomorrow without moving history, duplicating Drops or resetting reviewer actions', async () => {
    const today = await db.order.findUniqueOrThrow({ where: { orderNumber: 'DEMO-REVIEW-TODAY-2031-03-05' } });
    await db.order.update({ where: { id: today.id }, data: { customerNotes: 'Reviewer-owned note' } });
    const before = await snapshot();
    const beforeCounts = await counts();
    clock.set(new Date('2031-03-05T20:00:00Z'));
    const service = new DemoMaintenanceService(db as never, app.get(KitchenTime));
    expect((await service.maintain()).created).toHaveLength(2);
    expect((await service.maintain()).created).toHaveLength(0);
    const after = await snapshot();
    expect(after.filter((row) => before.some((old) => old.id === row.id))).toEqual(before);
    expect(after).toHaveLength(before.length + 2);
    const next = await db.order.findUniqueOrThrow({ where: { orderNumber: 'DEMO-REVIEW-TODAY-2031-03-06' }, include: { dropOrder: true } });
    expect(time.toDateString(next.deliveryDate)).toBe('2031-03-06');
    expect(next.status).toBe('OUT_FOR_DELIVERY');
    expect(await db.drop.count()).toBe(beforeCounts.drops + 1);
    expect(await db.invoice.count()).toBe(beforeCounts.invoices);
    expect(await db.orderCredit.count()).toBe(beforeCounts.credits);
    const list = await request(app.getHttpServer()).get('/api/driver/drops/today').set('Cookie', cookie).expect(200);
    expect(list.body.date).toBe('2031-03-06');
    expect(list.body.drops.map((drop: { id: string }) => drop.id)).toContain(next.dropOrder!.dropId);
  });
});
