import { describe, expect, it, vi } from 'vitest';
import { DropNotOwnedError } from '../dispatch/dispatch.errors.js';
import { DriverService } from './driver.service.js';

describe('DriverService', () => {
  it('lists only the current driver today and hides money', async () => {
    const prisma = {
      staff: { findUnique: vi.fn().mockResolvedValue({ id: 'drv-1' }) },
      drop: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'drop-1',
            status: 'OUT_FOR_DELIVERY',
            deliveryTime: new Date('1970-01-01T12:30:00Z'),
            notes: null,
            company: { id: 'co', name: 'Northwind' },
            companyAddress: { id: 'a', label: 'HQ', line1: '1', city: 'Bengaluru' },
            orders: [{ order: { id: 'o1', orderNumber: 'N-1', status: 'OUT_FOR_DELIVERY' } }],
          },
        ]),
      },
    };
    const service = new DriverService(
      prisma as never,
      {
        today: () => '2026-10-04',
        fromDateString: () => new Date('2026-10-04T00:00:00Z'),
        toDateString: () => '2026-10-04',
        toTimeString: () => '12:30',
      } as never,
      { deliver: vi.fn() } as never,
    );

    const result = await service.listToday('user-1');
    expect(prisma.drop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          driverStaffId: 'drv-1',
          deliveryDate: new Date('2026-10-04T00:00:00Z'),
        },
        orderBy: { deliveryTime: 'asc' },
      }),
    );
    expect(JSON.stringify(result)).not.toMatch(/Cents|price|subtotal|total/i);
  });

  it('refuses delivery when the drop is not the caller\'s', async () => {
    const deliver = vi.fn().mockRejectedValue(new DropNotOwnedError('drop-1'));
    const service = new DriverService(
      { staff: { findUnique: vi.fn().mockResolvedValue({ id: 'drv-1' }) } } as never,
      {} as never,
      { deliver } as never,
    );

    await expect(service.deliver('drop-1', 'user-1', {})).rejects.toBeInstanceOf(
      DropNotOwnedError,
    );
  });
});
