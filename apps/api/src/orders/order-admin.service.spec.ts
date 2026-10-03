import { describe, expect, it, vi } from 'vitest';
import { CompanyAddressNotOwnedError } from '../companies/companies.errors.js';
import { OrderVersionConflictError } from './orders.errors.js';
import { OrderAdminService } from './order-admin.service.js';

describe('OrderAdminService', () => {
  function setup(order: Record<string, unknown>) {
    const tx = {
      $executeRaw: vi.fn(),
      order: {
        findUnique: vi.fn().mockResolvedValue(order),
        update: vi.fn(),
      },
      companyAddress: { findUnique: vi.fn() },
      packagingType: { findUnique: vi.fn() },
    };

    const service = new OrderAdminService(
      { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as never,
      {
        lockAndRead: async () => {
          if ((order.version as number) !== 1) {
            throw new OrderVersionConflictError(1, order.version as number);
          }
          return order;
        },
      } as never,
      { getById: vi.fn().mockResolvedValue({ id: 'o1', ...order, version: 2 }) } as never,
      {
        fromTimeString: (value: string) => new Date(`1970-01-01T${value}:00.000Z`),
        toDateString: () => '2026-10-04',
        combineDateAndTime: () => new Date('2026-10-04T07:30:00.000Z'),
      } as never,
    );

    return { service, tx };
  }

  it('recalculates planned times and leaves money and actuals out of the patch', async () => {
    const { service, tx } = setup({
      id: 'o1',
      status: 'CONFIRMED',
      version: 1,
      deliveryDate: new Date('2026-10-04T00:00:00Z'),
      leaveKitchenMinutes: 60,
      kitchenStartedAt: new Date('2026-10-04T04:00:00Z'),
      totalCents: 2099,
    });

    await service.overrideDeliveryTime('o1', { deliveryTime: '13:00', version: 1 });
    const data = tx.order.update.mock.calls[0][0].data;
    expect(data.kitchenReadyAt).toBeInstanceOf(Date);
    expect(data.dispatchReadyAt).toBeInstanceOf(Date);
    expect(data.kitchenStartedAt).toBeUndefined();
    expect(data.totalCents).toBeUndefined();
    expect(data.version).toEqual({ increment: 1 });
  });

  it('rejects a stale version and a foreign address', async () => {
    const stale = setup({ id: 'o1', status: 'CONFIRMED', version: 4 });
    await expect(
      stale.service.overrideDeliveryTime('o1', { deliveryTime: '13:00', version: 1 }),
    ).rejects.toBeInstanceOf(OrderVersionConflictError);

    const { service, tx } = setup({
      id: 'o1',
      status: 'CONFIRMED',
      version: 1,
      companyId: 'co-1',
    });
    tx.companyAddress.findUnique.mockResolvedValue({
      id: 'addr-2',
      companyId: 'other',
      active: true,
    });
    await expect(
      service.overrideAddress('o1', { addressId: 'addr-2', version: 1 }),
    ).rejects.toBeInstanceOf(CompanyAddressNotOwnedError);
  });
});
