import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import request from 'supertest';
import { createSeedClient, seedAll, SEED_PASSWORD, type SeedClient } from '../prisma/seed.js';
import { seedDemoOperations, seedRichDemoData } from '../prisma/seed-demo.js';
import { DEMO_CREDIT_REASON, upsertFinancialDemoOrder } from '../prisma/seed-financials.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../src/auth/auth.constants.js';
import { configureApp } from '../src/bootstrap.js';
import { BILLABLE_STATUSES } from '../src/billing/billing.service.js';
import { Money } from '../src/pricing/domain/money.js';
import { PricingResolver } from '../src/pricing/domain/pricing-resolver.js';
import { PricingContextLoader } from '../src/pricing/pricing-context.loader.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { reserveDemoCompanies, RICH_DOMAINS } from './demo-seed.fixture.js';

const NUMBERS = ['DEMO-INV-ISSUED', 'DEMO-INV-PAID', 'DEMO-INV-VOID'];
const orderNumbers = ['DEMO-HIST-001', 'DEMO-TODAY-001', 'DEMO-FUT-001', 'DEMO-HIST-VOID-001',
  ...Array.from({ length: 26 }, (_, index) =>
    `RICH-${index < 8 ? 'PAST' : index < 14 ? 'TODAY' : 'FUTURE'}-${String(100 + index).padStart(4, '0')}`),
];
const orderWhere: Prisma.OrderWhereInput = { orderNumber: { in: orderNumbers } };
const rollback = new Error('P0-7 fixture rollback');

describe('P0-7 seeded financial consistency (real PostgreSQL)', () => {
  let prisma: SeedClient;
  let db: SeedClient;
  let app: INestApplication;
  let cookie: string;
  let transaction: Promise<void>;
  let finish: () => void;
  let transactionError: unknown;
  let preservedOrderIds: string[];
  let preservedHistory: unknown;

  const history = () => db.order.findMany({
    where: { id: { in: preservedOrderIds } }, orderBy: { id: 'asc' },
    include: {
      lines: { include: { combinations: { include: { options: true } } } },
      invoice: { include: { lines: true, orders: true, credits: true } },
      credits: true,
    },
  });

  beforeAll(async () => {
    prisma = createSeedClient();
    let ready!: () => void;
    let fail!: (error: unknown) => void;
    const seeded = new Promise<void>((resolve, reject) => { ready = resolve; fail = reject; });
    const held = new Promise<void>((resolve) => { finish = resolve; });
    transaction = prisma.$transaction(async (tx) => {
      // Seed helpers and HTTP services share a real transaction. Nothing commits.
      db = new Proxy(tx, { get(target, property) {
        if (property === '$transaction') return (run: (client: Prisma.TransactionClient) => Promise<unknown>) => run(tx);
        return Reflect.get(target, property);
      } }) as unknown as SeedClient;
      // Reserve canonical lookup keys only inside this rollback-only fixture.
      // Existing reviewer/history rows keep their IDs, money, invoice links,
      // lines and credits; normal seed setup gets new independent records.
      const existingOrders = await tx.order.findMany({ where: orderWhere, select: { id: true } });
      preservedOrderIds = existingOrders.map((order) => order.id);
      for (const order of existingOrders) {
        await tx.order.update({ where: { id: order.id }, data: { orderNumber: `P07-preserved-${order.id}` } });
      }
      const existingInvoices = await tx.invoice.findMany({ where: { invoiceNumber: { in: NUMBERS } }, select: { id: true } });
      for (const invoice of existingInvoices) {
        await tx.invoice.update({ where: { id: invoice.id }, data: { invoiceNumber: `P07-preserved-${invoice.id}` } });
      }
      const domain = await tx.companyDomain.findUnique({ where: { domain: 'northwind.com' } });
      if (domain) await tx.companyDomain.update({ where: { id: domain.id }, data: { domain: `p07-preserved-${domain.id}.test` } });
      const employee = await tx.customerEmployee.findUnique({ where: { email: 'alice@northwind.com' } });
      if (employee) await tx.customerEmployee.update({ where: { id: employee.id }, data: { email: `p07-preserved-${employee.id}@example.test` } });
      await reserveDemoCompanies(tx, [...RICH_DOMAINS, 'fernleaf-demo.test']);
      const reviewKeys = await tx.demoOwnedRecord.findMany({ where: { key: { startsWith: 'demo:review:' } } });
      for (const row of reviewKeys) await tx.demoOwnedRecord.update({ where: { key: row.key }, data: { key: `p07-preserved:${row.key}` } });
      const reviewOrders = await tx.order.findMany({ where: { orderNumber: { startsWith: 'DEMO-REVIEW-' } } });
      for (const row of reviewOrders) await tx.order.update({ where: { id: row.id }, data: { orderNumber: `p07-preserved-${row.id}` } });
      preservedHistory = await history();
      await seedAll(db);
      await seedRichDemoData(db);
      ready();
      await held;
      throw rollback;
    }, { timeout: 180_000, maxWait: 10_000 }).catch((error: unknown) => {
      if (error !== rollback) { transactionError = error; fail(error); }
    });
    await seeded;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'admin@test.com', password: SEED_PASSWORD }).expect(200);
    cookie = (login.headers['set-cookie'] as unknown as string[]).find((value) => value.startsWith(AUTH_COOKIE_NAME))!;
  }, 120_000);

  afterAll(async () => {
    try {
      if (app && preservedHistory) expect(await history()).toEqual(preservedHistory);
    } finally {
      await app?.close();
      finish?.();
      await transaction;
      await prisma?.$disconnect();
    }
    if (transactionError) throw transactionError;
  });

  const orders = () => db.order.findMany({ where: orderWhere, orderBy: { orderNumber: 'asc' }, include: {
    lines: { include: { combinations: { include: { options: true } } } },
  } });
  const invoices = () => db.invoice.findMany({ where: { invoiceNumber: { in: NUMBERS } }, orderBy: { invoiceNumber: 'asc' }, include: {
    lines: { include: { order: true, orderCredit: true } }, orders: true, credits: true,
  } });

  it('reconciles every basic/rich Order, line, combination, quantity, and integer monetary snapshot', async () => {
    const rows = await orders();
    expect(rows).toHaveLength(30);
    for (const order of rows) {
      expect(order.lines.length).toBeGreaterThan(0);
      let total = Money.zero();
      for (const line of order.lines) {
        expect(line.combinations.length).toBeGreaterThan(0);
        expect(line.quantity).toBe(line.combinations.reduce((sum, combo) => sum + combo.quantity, 0));
        expect(line.lineTotalCents).toBe(line.combinations.reduce((sum, combo) => sum + combo.totalCents, 0));
        expect(line.unitPriceCents).toBe(Math.trunc(line.lineTotalCents / line.quantity));
        for (const combo of line.combinations) {
          expect(combo.optionsPriceCents).toBe(combo.options.reduce((sum, option) => sum + option.optionPriceCents, 0));
          expect(combo.totalCents).toBe(Money.fromCents(combo.unitPriceCents).times(combo.quantity).cents);
        }
        total = total.plus(Money.fromCents(line.lineTotalCents));
      }
      expect(order.subtotalCents).toBe(total.cents);
      expect(order.totalCents).toBe(total.cents);
    }
  });

  it('reconciles all demo invoices to actual billable orders and signed invoice lines', async () => {
    const rows = await invoices();
    expect(rows).toHaveLength(3);
    for (const invoice of rows) {
      const billed = invoice.lines.filter((line) => line.type === 'ORDER');
      expect(billed.length).toBeGreaterThan(0);
      expect(invoice.subtotalCents).toBe(billed.reduce((sum, line) => sum + line.amountCents, 0));
      expect(invoice.totalCents).toBe(invoice.lines.reduce((sum, line) => sum + line.amountCents, 0));
      expect(invoice.totalCents).toBe(invoice.subtotalCents - invoice.creditCents);
      for (const line of billed) {
        expect(line.order).not.toBeNull();
        expect(line.order!.companyId).toBe(invoice.companyId);
        expect(BILLABLE_STATUSES).toContain(line.order!.status);
        expect(line.amountCents).toBe(line.order!.totalCents);
        if (invoice.status !== 'VOID') expect(line.order!.invoiceId).toBe(invoice.id);
      }
      const response = await request(app.getHttpServer()).get(`/api/invoices/${invoice.id}`).set('Cookie', cookie).expect(200);
      expect(response.body.totalCents).toBe(invoice.totalCents);
      expect(response.body.lines).toHaveLength(invoice.lines.length);
    }
  });

  it('represents full payment by PAID status without overpayment or invented payment fields', async () => {
    const rows = await invoices();
    const paid = rows.filter((invoice) => invoice.status === 'PAID');
    expect(paid).toHaveLength(1);
    for (const invoice of paid) {
      expect(Number.isSafeInteger(invoice.totalCents)).toBe(true);
      expect(invoice.totalCents).toBeGreaterThan(0);
      expect(invoice.totalCents).toBe(invoice.lines.reduce((sum, line) => sum + line.amountCents, 0));
    }
    const voided = rows.find((invoice) => invoice.status === 'VOID')!;
    expect(voided.orders).toHaveLength(0);
    expect(voided.credits).toHaveLength(0);
  });

  it('reconciles the applied demo credit and reduces the issued invoice balance once', async () => {
    const invoice = (await invoices()).find((row) => row.status === 'ISSUED')!;
    expect(invoice.credits).toHaveLength(1);
    const credit = invoice.credits[0]!;
    expect(credit.reason).toBe(DEMO_CREDIT_REASON);
    expect(credit.invoiceId).toBe(invoice.id);
    expect(credit.companyId).toBe(invoice.companyId);
    expect(credit.amountCents).toBeGreaterThan(0);
    const order = invoice.orders[0]!;
    expect(credit.orderId).toBe(order.id);
    const used = await db.orderCredit.aggregate({ where: { orderId: order.id }, _sum: { amountCents: true } });
    expect(used._sum.amountCents).toBeLessThanOrEqual(order.totalCents);
    expect(invoice.creditCents).toBe(credit.amountCents);
    expect(invoice.totalCents).toBe(order.totalCents - credit.amountCents);
    expect(invoice.lines.find((line) => line.type === 'CREDIT')).toMatchObject({ orderCreditId: credit.id, amountCents: -credit.amountCents });
  });

  it('reconciles company outstanding balances from issued invoice ledgers, excluding paid/void amounts', async () => {
    const allInvoices = await db.invoice.findMany({ where: { status: 'ISSUED' }, include: { lines: true } });
    const companyIds = [...new Set((await invoices()).map((invoice) => invoice.companyId))];
    for (const companyId of companyIds) {
      const issued = allInvoices.filter((invoice) => invoice.companyId === companyId);
      const ledger = issued.reduce((sum, invoice) => sum + invoice.lines.reduce((amount, line) => amount + line.amountCents, 0), 0);
      const outstanding = await db.invoice.aggregate({ where: { companyId, status: 'ISSUED' }, _sum: { totalCents: true } });
      expect(outstanding._sum.totalCents ?? 0).toBe(ledger);
    }
  });

  it('returns dashboard balances/counts matching persisted production filters and invoice credit reductions', async () => {
    const response = await request(app.getHttpServer()).get('/api/dashboard/admin').set('Cookie', cookie).expect(200);
    const billable = await db.order.findMany({ where: { invoiceId: null, status: { in: [...BILLABLE_STATUSES] } } });
    const issued = await db.invoice.findMany({ where: { status: 'ISSUED' } });
    expect(response.body.metrics.uninvoicedBalanceCents).toBe(billable.reduce((sum, order) => sum + order.totalCents, 0));
    expect(response.body.metrics.uninvoicedOrderCount).toBe(billable.length);
    expect(response.body.metrics.outstandingInvoices).toEqual({ count: issued.length, totalCents: issued.reduce((sum, invoice) => sum + invoice.totalCents, 0) });
    const companyId = (await invoices())[0]!.companyId;
    const list = await request(app.getHttpServer()).get('/api/billing/orders?limit=100').set('Cookie', cookie).expect(200);
    const group = list.body.data.find((row: { company: { id: string } }) => row.company.id === companyId);
    expect(group).toBeDefined();
    const persisted = await db.order.findMany({ where: { id: { in: group.orders.map((order: { id: string }) => order.id) } } });
    expect(group.totalCents).toBe(persisted.reduce((sum, order) => sum + order.totalCents, 0));
    expect(persisted.every((order) => order.companyId === companyId && order.invoiceId === null &&
      BILLABLE_STATUSES.includes(order.status as (typeof BILLABLE_STATUSES)[number]))).toBe(true);
  });

  it('reruns both generators without repricing existing snapshots, duplicating credits, or changing billing links', async () => {
    const before = { orders: await orders(), invoices: await invoices() };
    await seedDemoOperations(db);
    await seedRichDemoData(db);
    expect({ orders: await orders(), invoices: await invoices() }).toEqual(before);
  }, 30_000);

  it('uses production derived pricing for a new snapshot and rejects a missing price instead of fabricating a fallback', async () => {
    const template = await db.order.findUniqueOrThrow({ where: { orderNumber: 'RICH-PAST-0100' } });
    const sourceLine = await db.orderLine.findFirstOrThrow({ where: { orderId: template.id } });
    const dish = await db.dish.findUniqueOrThrow({ where: { id: sourceLine.dishId! } });
    const override = await db.dishTierPrice.findUniqueOrThrow({ where: {
      dishId_priceTierId: { dishId: dish.id, priceTierId: template.priceTierId },
    } });
    await db.dishTierPrice.delete({ where: { id: override.id } });
    const context = await app.get(PricingContextLoader).loadForTier(template.priceTierId);
    const price = app.get(PricingResolver).resolve(context, { id: dish.id, type: 'dish', costCents: dish.costCents });
    expect(price.status).toBe('PRICED');
    if (price.status !== 'PRICED') throw new Error('Expected derived Enterprise price');
    expect(price.source).toBe('DERIVED');
    const { id: _id, createdAt: _created, updatedAt: _updated, ...header } = template;
    const id = await upsertFinancialDemoOrder(db, { ...header, orderNumber: 'P07-DERIVED', invoiceId: null }, dish.id);
    const created = await db.order.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    expect(created.lines[0]!.unitPriceCents).toBe(price.priceCents);
    expect(created.totalCents).toBe(Money.fromCents(price.priceCents).times(2).cents);
    const standard = await db.priceTier.findUniqueOrThrow({ where: { code: 'STANDARD' } });
    const unpriced = await db.dish.findUniqueOrThrow({ where: { sku: 'FK-SPECIAL-001' } });
    await expect(upsertFinancialDemoOrder(db, {
      ...header, orderNumber: 'P07-MISSING', invoiceId: null, priceTierId: standard.id,
    }, unpriced.id)).rejects.toThrow('has no price');
    expect(await db.order.findUnique({ where: { orderNumber: 'P07-MISSING' } })).toBeNull();
    await db.dishTierPrice.create({ data: override });
  });

  it('repairs legacy basic headers, empty invoice identities, and cancelled/rejected rich financial history', async () => {
    // Corrupt only this test's newly generated paid history. The normal seed
    // must refuse it and leave both the Order and its invoice exactly as found.
    const historical = await db.order.findUniqueOrThrow({ where: { orderNumber: 'DEMO-HIST-001' } });
    expect(historical.invoiceId).not.toBeNull();
    await db.order.update({ where: { id: historical.id }, data: {
      subtotalCents: historical.subtotalCents - 1, totalCents: historical.totalCents - 1,
    } });
    const historicalSnapshot = () => db.order.findUniqueOrThrow({ where: { id: historical.id }, include: {
      lines: { include: { combinations: true } }, invoice: { include: { lines: true, orders: true, credits: true } },
    } });
    const corruptedHistory = await historicalSnapshot();
    await expect(seedDemoOperations(db)).rejects.toThrow('Cannot repair invoiced demo total DEMO-HIST-001');
    expect(await historicalSnapshot()).toEqual(corruptedHistory);
    await db.order.update({ where: { id: historical.id }, data: {
      subtotalCents: historical.subtotalCents, totalCents: historical.totalCents,
    } });

    // The separate repair fixture releases its own generated invoice links
    // before constructing legacy uninvoiced defects. No reviewer data is used.
    const before = await invoices();
    const invoiceIds = before.map((invoice) => invoice.id);
    await db.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await db.order.updateMany({ where: { invoiceId: { in: invoiceIds } }, data: { invoiceId: null } });
    await db.orderCredit.updateMany({ where: { invoiceId: { in: invoiceIds } }, data: { invoiceId: null } });
    await db.invoice.updateMany({ where: { id: { in: invoiceIds } }, data: { subtotalCents: 123, totalCents: 123, creditCents: 0 } });
    await db.order.updateMany({ where: { orderNumber: { in: ['DEMO-HIST-001', 'DEMO-TODAY-001', 'DEMO-FUT-001'] } }, data: { subtotalCents: 2099, totalCents: 2099 } });
    const cancelled = await db.order.findMany({ where: { ...orderWhere, status: { in: ['CANCELLED', 'REJECTED'] } } });
    expect(cancelled).toHaveLength(2);
    await db.orderLine.deleteMany({ where: { orderId: { in: cancelled.map((order) => order.id) } } });
    await seedDemoOperations(db);
    await seedRichDemoData(db);
    expect((await invoices()).map((invoice) => invoice.id)).toEqual(invoiceIds);
    for (const order of await orders()) {
      expect(order.totalCents).toBe(order.lines.reduce((sum, line) => sum + line.lineTotalCents, 0));
    }
    for (const invoice of await invoices()) {
      expect(invoice.totalCents).toBe(invoice.lines.reduce((sum, line) => sum + line.amountCents, 0));
    }
    expect(await db.prepUnit.count({ where: { orderId: { in: cancelled.map((order) => order.id) } } })).toBe(0);
  }, 30_000);
});
