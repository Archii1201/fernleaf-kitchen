import { describe, expect, it, vi } from 'vitest';
import { DemoMaintenanceService } from './demo-maintenance.service.js';

describe('DemoMaintenanceService', () => {
  it('creates only missing demo keys and skips illegal cutoff dates', async () => {
    const prisma = {
      demoOwnedRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        delete: vi.fn(),
      },
      customerEmployee: {
        findUnique: vi.fn().mockResolvedValue({ id: 'emp' }),
      },
      dish: { findUnique: vi.fn().mockResolvedValue({ id: 'dish' }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'admin' }) },
      staff: { findUnique: vi.fn().mockResolvedValue({ id: 'drv' }) },
      order: { findUnique: vi.fn().mockResolvedValue(null) },
      drop: { upsert: vi.fn(), findUnique: vi.fn() },
      dropOrder: { upsert: vi.fn() },
    };
    const create = vi.fn().mockResolvedValue({ id: 'ord-1' });

    const service = new DemoMaintenanceService(
      prisma as never,
      {
        today: () => '2026-10-04',
        timeZone: 'Asia/Kolkata',
      } as never,
      { resolve: vi.fn().mockResolvedValue({ hasPassed: true }) } as never,
      { create } as never,
    );

    const result = await service.maintain();
    expect(create).toHaveBeenCalled();
    expect(result.created.length).toBeGreaterThan(0);
    expect(create.mock.calls.every((call) => call[0].deliveryDate !== '2026-10-04')).toBe(true);
  });
});
