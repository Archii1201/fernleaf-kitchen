import { describe, expect, it, vi } from 'vitest';
import { DropConflictError, DropDriverRequiredError } from './dispatch.errors.js';
import { DispatchService } from './dispatch.service.js';

describe('DispatchService', () => {
  function setup(orderStatus: string, dropStatus = 'PENDING', driverStaffId: string | null = null) {
    const order = {
      id: 'ord-1',
      status: orderStatus,
      companyId: 'co',
      deliveryAddressId: 'addr',
      deliveryDate: new Date('2026-10-04T00:00:00Z'),
      deliveryTime: new Date('1970-01-01T12:30:00Z'),
      dropOrder: { dropId: 'drop-1' },
    };
    const drop = {
      id: 'drop-1',
      status: dropStatus,
      driverStaffId,
      deliveryDate: order.deliveryDate,
      deliveryTime: order.deliveryTime,
      notes: null,
      deliveryPhotoFileId: null,
      orders: [{ order: { id: 'ord-1', status: dropStatus === 'READY' ? 'DISPATCH_READY' : orderStatus } }],
    };
    const loaded = { id: 'drop-1', status: 'READY', orders: [] };

    const tx = {
      $executeRaw: vi.fn(),
      order: {
        findUnique: vi.fn().mockResolvedValue(order),
        update: vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => {
          order.status = data.status;
        }),
      },
      drop: {
        findUnique: vi.fn().mockResolvedValue(drop),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...drop,
          company: { id: 'co', name: 'Northwind' },
          companyAddress: { id: 'addr', label: 'HQ', line1: '1', city: 'Bengaluru' },
          driver: null,
          orders: [{ order: { id: 'ord-1', orderNumber: 'N-1', status: order.status } }],
        }),
        update: vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => {
          drop.status = data.status;
        }),
        upsert: vi.fn().mockResolvedValue(drop),
      },
      dropOrder: {
        findMany: vi.fn().mockResolvedValue([{ order: { status: 'DISPATCH_READY' } }]),
        upsert: vi.fn(),
      },
      orderEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };

    const service = new DispatchService(
      { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as never,
      {
        now: () => new Date('2026-10-04T07:00:00Z'),
        toDateString: () => '2026-10-04',
        toTimeString: () => '12:30',
        combineDateAndTime: () => new Date('2026-10-04T07:00:00Z'),
      } as never,
      { assertEligible: vi.fn() } as never,
      { getDeliveryGraceMinutes: vi.fn().mockResolvedValue(15) } as never,
    );

    return { service, tx, loaded };
  }

  it('marks kitchen-ready as dispatch-ready once', async () => {
    const { service, tx } = setup('READY');
    await service.markOrderReady('ord-1', 'user-1');
   expect(tx.order.update).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({
      status: 'DISPATCH_READY',
    }),
  }),
);
    await expect(service.markOrderReady('ord-1', 'user-1')).rejects.toBeInstanceOf(
      DropConflictError,
    );
  });

  it('rejects dispatch-ready before kitchen ready', async () => {
    const { service } = setup('IN_KITCHEN');
    await expect(service.markOrderReady('ord-1', 'user-1')).rejects.toBeInstanceOf(
      DropConflictError,
    );
  });

  it('requires a driver before out and rejects skipping dispatch-ready', async () => {
    const pending = setup('DISPATCH_READY', 'PENDING');
    await expect(pending.service.markOut('drop-1', 'user-1')).rejects.toBeInstanceOf(
      DropConflictError,
    );

    const readyNoDriver = setup('DISPATCH_READY', 'READY', null);
    await expect(readyNoDriver.service.markOut('drop-1', 'user-1')).rejects.toBeInstanceOf(
      DropDriverRequiredError,
    );
  });

  it('rejects a repeated out', async () => {
    const { service } = setup('OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'drv');
    await expect(service.markOut('drop-1', 'user-1')).rejects.toBeInstanceOf(DropConflictError);
  });

  it('rejects a repeated delivery', async () => {
    const { service } = setup('DELIVERED', 'DELIVERED', 'drv');
    await expect(service.deliver('drop-1', 'user-1')).rejects.toBeInstanceOf(DropConflictError);
  });
});
