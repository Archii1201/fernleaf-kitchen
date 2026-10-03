import { describe, expect, it, vi } from 'vitest';
import { CreditValidationError, InvoiceConflictError, OrderNotBillableError } from './billing.errors.js';
import { BillingService } from './billing.service.js';

describe('BillingService', () => {
  it('refuses a second invoice on a locked order and a credit over the order total', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      order: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'o1',
            companyId: 'co',
            status: 'CONFIRMED',
            invoiceId: 'inv-old',
            totalCents: 2099,
            orderNumber: 'N-1',
          },
        ]),
        findUnique: vi.fn().mockResolvedValue({
          id: 'o1',
          companyId: 'co',
          totalCents: 2099,
        }),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      orderCredit: {
        findMany: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 2099 } }),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      invoice: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      invoiceLine: { create: vi.fn() },
    };

    const service = new BillingService(
      { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as never,
      {
        now: () => new Date('2026-10-04T00:00:00Z'),
        today: () => '2026-10-04',
        fromDateString: () => new Date('2026-10-04T00:00:00Z'),
      } as never,
    );

    await expect(service.createInvoice({ orderIds: ['o1'] })).rejects.toBeInstanceOf(
      OrderNotBillableError,
    );
    await expect(
      service.createCredit('o1', { amountCents: 1, reason: 'too much' }, 'u1'),
    ).rejects.toBeInstanceOf(CreditValidationError);
  });

  it('rejects paying or voiding a paid invoice', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      invoice: {
        findUnique: vi.fn().mockResolvedValue({ id: 'inv', status: 'PAID' }),
        update: vi.fn(),
      },
    };
    const service = new BillingService(
      { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as never,
      {} as never,
    );

    await expect(service.voidInvoice('inv')).rejects.toBeInstanceOf(InvoiceConflictError);
    await expect(service.markPaid('inv')).rejects.toBeInstanceOf(InvoiceConflictError);
  });
});
