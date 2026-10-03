import { describe, expect, it, vi } from 'vitest';
import { DashboardService } from './dashboard.service.js';

describe('DashboardService', () => {
  it('excludes cancelled/rejected from today counts and treats a zero on-time denominator as null', async () => {
    const prisma = {
      order: {
        count: vi.fn().mockResolvedValue(2),
        aggregate: vi.fn().mockResolvedValue({ _sum: { totalCents: 0 }, _count: 0 }),
      },
      orderLine: { aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 4 } }) },
      prepUnit: { count: vi.fn().mockResolvedValue(0) },
      invoice: { aggregate: vi.fn().mockResolvedValue({ _sum: { totalCents: 1000 }, _count: 1 }) },
      cutoffRun: { findFirst: vi.fn().mockResolvedValue(null) },
      priceTier: { findFirst: vi.fn().mockResolvedValue({ id: 't' }) },
      kitchenSettings: { findUnique: vi.fn().mockResolvedValue({ id: 'singleton' }) },
      company: { findMany: vi.fn().mockResolvedValue([]) },
      dish: { count: vi.fn().mockResolvedValue(0) },
      drop: { findMany: vi.fn().mockResolvedValue([]) },
      staff: { findUnique: vi.fn().mockResolvedValue({ id: 'drv' }) },
    };

    const service = new DashboardService(
      prisma as never,
      {
        today: () => '2026-10-04',
        fromDateString: () => new Date('2026-10-04T00:00:00Z'),
        now: () => new Date('2026-10-04T06:00:00Z'),
        timeZone: 'Asia/Kolkata',
        toTimeString: () => '12:30',
      } as never,
      {
        resolve: vi.fn().mockResolvedValue({
          hasPassed: false,
          cutoffAt: new Date('2026-10-05T10:30:00Z'),
          cutoffDate: '2026-10-05',
        }),
      } as never,
      { board: vi.fn().mockResolvedValue({ stations: [] }) } as never,
    );

    const admin = await service.admin();
    expect(prisma.order.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ['CANCELLED', 'REJECTED'] },
        }),
      }),
    );
    expect(admin.metrics.kitchenProgress.percentComplete).toBe(0);
    expect(JSON.stringify(admin)).toMatch(/uninvoicedBalanceCents/);

    const dispatch = await service.dispatch();
    expect(dispatch.metrics.onTimeRatePercent).toBeNull();

    const kitchen = await service.kitchen();
    expect(JSON.stringify(kitchen)).not.toMatch(/Cents|invoice|price/i);
  });
});
