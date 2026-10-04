import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreditValidationError,
  InvoiceConflictError,
  OrderNotBillableError,
} from './billing.errors.js';
import { BillingService } from './billing.service.js';

describe('Step 24 Part 4: Invoicing & Billing Lifecycle Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let billingService: BillingService;

  let companyId: string;
  let employeeId: string;
  let addressId: string;
  let tierId: string;
  let adminUserId: string;

  const createdOrderIds: string[] = [];
  const createdInvoiceIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    billingService = app.get(BillingService);

    const domain = await prisma.companyDomain.findUniqueOrThrow({
      where: { domain: 'northwind.com' },
      select: { companyId: true },
    });
    companyId = domain.companyId;

    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { defaultAddressId: true, priceTierId: true },
    });
    addressId = company.defaultAddressId!;
    tierId = company.priceTierId!;

    const employee = await prisma.customerEmployee.findUniqueOrThrow({
      where: { email: 'alice@northwind.com' },
      select: { id: true },
    });
    employeeId = employee.id;

    const admin = await prisma.user.findFirstOrThrow({
      where: { email: 'admin@test.com' },
      select: { id: true },
    });
    adminUserId = admin.id;
  });

  afterAll(async () => {
    if (createdInvoiceIds.length > 0) {
      await prisma.invoiceLine.deleteMany({
        where: { invoiceId: { in: createdInvoiceIds } },
      });
      await prisma.orderCredit.deleteMany({
        where: { invoiceId: { in: createdInvoiceIds } },
      });
      await prisma.order.updateMany({
        where: { id: { in: createdOrderIds } },
        data: { invoiceId: null },
      });
      await prisma.invoice.deleteMany({
        where: { id: { in: createdInvoiceIds } },
      });
    }

    if (createdOrderIds.length > 0) {
      await prisma.orderCredit.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
    }

    await app.close();
  });

  async function createTestOrder(suffix: string, totalCents = 2500): Promise<string> {
    const order = await prisma.order.create({
      data: {
        orderNumber: `STEP24-BIL-${suffix}`,
        companyId,
        customerEmployeeId: employeeId,
        status: 'CONFIRMED',
        deliveryDate: new Date('2026-11-01T00:00:00.000Z'),
        deliveryTime: new Date('1970-01-01T12:30:00.000Z'),
        deliveryAddressId: addressId,
        deliveryAddressLabel: 'HQ',
        deliveryAddressLine1: '1 Tech Park',
        deliveryAddressCity: 'Bengaluru',
        deliveryAddressPostalCode: '560025',
        deliveryAddressCountry: 'IN',
        priceTierId: tierId,
        priceTierName: 'Standard',
        leaveKitchenMinutes: 60,
        subtotalCents: totalCents,
        totalCents,
      },
      select: { id: true },
    });

    createdOrderIds.push(order.id);
    return order.id;
  }

  describe('Case 1: One invoice for billable order', () => {
    it('creates exactly one invoice for a confirmed billable order', async () => {
      const orderId = await createTestOrder(`O1-${Date.now()}`, 3000);
      const invoice = await billingService.createInvoice({ orderIds: [orderId] });
      createdInvoiceIds.push(invoice.id);

      expect(invoice).toBeDefined();
      expect(invoice.companyId).toBe(companyId);
      expect(invoice.status).toBe('ISSUED');
      expect(invoice.subtotalCents).toBe(3000);
      expect(invoice.totalCents).toBe(3000);

      // Order must now reference this invoice
      const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(updatedOrder.invoiceId).toBe(invoice.id);
    });
  });

  describe('Case 2: Duplicate invoice attempt fails', () => {
    it('rejects subsequent invoice creation attempt for an already-invoiced order', async () => {
      const orderId = await createTestOrder(`DUP-${Date.now()}`, 2000);
      const invoice = await billingService.createInvoice({ orderIds: [orderId] });
      createdInvoiceIds.push(invoice.id);

      // Attempting to bill the same order again
      await expect(
        billingService.createInvoice({ orderIds: [orderId] }),
      ).rejects.toBeInstanceOf(OrderNotBillableError);
    });
  });

  describe('Case 3: Concurrent invoice creation', () => {
    it('resolves real concurrent invoice requests so exactly ONE wins and the other receives conflict error', async () => {
      const orderId = await createTestOrder(`CONC-${Date.now()}`, 4000);

      // Fire two concurrent invoice creation requests for the exact same order
      const [resA, resB] = await Promise.allSettled([
        billingService.createInvoice({ orderIds: [orderId] }),
        billingService.createInvoice({ orderIds: [orderId] }),
      ]);

      const fulfilled = [resA, resB].filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<BillingService['createInvoice']>>> =>
          r.status === 'fulfilled',
      );
      const rejected = [resA, resB].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      createdInvoiceIds.push(fulfilled[0].value.id);
      expect(rejected[0].reason).toBeInstanceOf(OrderNotBillableError);

      // Verify DB integrity: exactly one invoice row exists for this order
      const associatedInvoices = await prisma.invoice.count({
        where: { orders: { some: { id: orderId } } },
      });
      expect(associatedInvoices).toBe(1);
    });
  });

  describe('Case 4: Voiding an invoice', () => {
    it('voids an issued invoice and detaches orders for rebilling', async () => {
      const orderId = await createTestOrder(`VOID-${Date.now()}`, 1500);
      const invoice = await billingService.createInvoice({ orderIds: [orderId] });
      createdInvoiceIds.push(invoice.id);

      const voided = await billingService.voidInvoice(invoice.id);
      expect(voided.status).toBe('VOID');

      // Order invoiceId is cleared
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.invoiceId).toBeNull();

      // Attempting to void again fails with ALREADY_VOID
      await expect(billingService.voidInvoice(invoice.id)).rejects.toThrow(
        expect.objectContaining({ code: 'INVOICE_ALREADY_VOID' }),
      );
    });
  });

  describe('Case 5: Paid invoices are immutable', () => {
    it('rejects mutation or voiding of an invoice once it becomes PAID', async () => {
      const orderId = await createTestOrder(`PAID-${Date.now()}`, 1800);
      const invoice = await billingService.createInvoice({ orderIds: [orderId] });
      createdInvoiceIds.push(invoice.id);

      const paid = await billingService.markPaid(invoice.id);
      expect(paid.status).toBe('PAID');

      // Voiding a paid invoice is rejected
      await expect(billingService.voidInvoice(invoice.id)).rejects.toThrow(
        expect.objectContaining({ code: 'INVOICE_PAID_IMMUTABLE' }),
      );

      // Marking already paid is rejected
      await expect(billingService.markPaid(invoice.id)).rejects.toThrow(
        expect.objectContaining({ code: 'INVOICE_ALREADY_PAID' }),
      );
    });
  });

  describe('Case 6: Order credit creation', () => {
    it('creates an order credit within allowed limits', async () => {
      const orderId = await createTestOrder(`CRD-${Date.now()}`, 2500);

      const credit = await billingService.createCredit(
        orderId,
        { amountCents: 500, reason: 'Packaging defect' },
        adminUserId,
      );

      expect(credit).toBeDefined();
      expect(credit.amountCents).toBe(500);
      expect(credit.orderId).toBe(orderId);
      expect(credit.reason).toBe('Packaging defect');
    });
  });

  describe('Case 7: Exceeding credit limit fails', () => {
    it('rejects credit creation when requested credit exceeds remaining order total', async () => {
      const orderId = await createTestOrder(`LIMIT-${Date.now()}`, 1000);

      // Attempting credit of 1500 on 1000 order total
      await expect(
        billingService.createCredit(
          orderId,
          { amountCents: 1500, reason: 'Excessive refund' },
          adminUserId,
        ),
      ).rejects.toBeInstanceOf(CreditValidationError);

      // First valid credit of 800
      await billingService.createCredit(
        orderId,
        { amountCents: 800, reason: 'First refund' },
        adminUserId,
      );

      // Second credit of 300 exceeds remaining capacity (1000 - 800 = 200)
      await expect(
        billingService.createCredit(
          orderId,
          { amountCents: 300, reason: 'Second refund' },
          adminUserId,
        ),
      ).rejects.toBeInstanceOf(CreditValidationError);
    });
  });

  describe('Case 8: Exact invoice total with credits (integer cents, no floats)', () => {
    it('computes exact integer cents subtotal, credits applied, and net total', async () => {
      const orderId = await createTestOrder(`TOT-${Date.now()}`, 3500);

      // Add a 600-cent credit to the order before invoicing
      await billingService.createCredit(
        orderId,
        { amountCents: 600, reason: 'Promotion adjustment' },
        adminUserId,
      );

      const invoice = await billingService.createInvoice({ orderIds: [orderId] });
      createdInvoiceIds.push(invoice.id);

      expect(invoice.subtotalCents).toBe(3500);
      expect(invoice.creditCents).toBe(600);
      expect(invoice.totalCents).toBe(2900); // 3500 - 600 = 2900 exactly
      expect(Number.isInteger(invoice.totalCents)).toBe(true);

      // Verify invoice line items
      const orderLine = invoice.lines.find((l) => l.type === 'ORDER');
      const creditLine = invoice.lines.find((l) => l.type === 'CREDIT');

      expect(orderLine?.amountCents).toBe(3500);
      expect(creditLine?.amountCents).toBe(-600);
    });
  });
});
