import { describe, expect, it, vi } from 'vitest';
import { seedDailyReviewData } from '../../prisma/seed-runtime.js';
import { DemoMaintenanceService } from './demo-maintenance.service.js';

vi.mock('../../prisma/seed-runtime.js', () => ({ seedDailyReviewData: vi.fn() }));

describe('DemoMaintenanceService', () => {
  it('uses the application clock and timezone for the shared date-owned seed path', async () => {
    const now = new Date('2031-03-04T20:00:00Z');
    const prisma = {};
    vi.mocked(seedDailyReviewData).mockResolvedValue({ created: ['demo:review:today:2031-03-05'] });
    const service = new DemoMaintenanceService(prisma as never, {
      now: () => now, timeZone: 'Asia/Kolkata',
    } as never);
    expect(await service.maintain()).toEqual({ created: ['demo:review:today:2031-03-05'] });
    expect(seedDailyReviewData).toHaveBeenCalledWith(prisma, { now, timeZone: 'Asia/Kolkata' });
  });
  it('surfaces validation failures instead of reporting empty success', async () => {
    vi.mocked(seedDailyReviewData).mockRejectedValue(new Error('Company does not receive deliveries'));
    const service = new DemoMaintenanceService({} as never, { now: () => new Date(), timeZone: 'Asia/Kolkata' } as never);
    await expect(service.maintain()).rejects.toThrow('Company does not receive deliveries');
  });
});
