import { describe, expect, it, vi } from 'vitest';
import { CutoffProcessingService } from './cutoff-processing.service.js';

const PAST = '2026-01-07';
const FUTURE = '2031-03-05';

describe('CutoffProcessingService', () => {
  function setup(hasPassed: boolean, existingRun: unknown = null) {
    const tx = {
      $executeRaw: vi.fn(),
      cutoffRun: {
        findFirst: vi.fn().mockResolvedValue(existingRun),
        upsert: vi.fn().mockResolvedValue({
          id: 'run-1',
          cutoffAt: new Date('2026-01-05T10:30:00Z'),
          ordersConfirmed: 1,
          ordersRejected: 1,
        }),
      },
      order: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'draft-1',
            status: 'DRAFT',
            companyId: 'co',
            deliveryAddressId: 'addr',
            deliveryDate: new Date('2026-01-07T00:00:00Z'),
            deliveryTime: new Date('1970-01-01T12:30:00Z'),
            leaveKitchenMinutes: 60,
            kitchenStartedAt: null,
          },
          {
            id: 'placed-1',
            status: 'PLACED',
            companyId: 'co',
            deliveryAddressId: 'addr',
            deliveryDate: new Date('2026-01-07T00:00:00Z'),
            deliveryTime: new Date('1970-01-01T12:30:00Z'),
            leaveKitchenMinutes: 60,
            kitchenStartedAt: null,
          },
        ]),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      orderEvent: { create: vi.fn() },
      drop: { upsert: vi.fn().mockResolvedValue({ id: 'drop-1' }), count: vi.fn().mockResolvedValue(1) },
      dropOrder: { upsert: vi.fn() },
    };

    const service = new CutoffProcessingService(
      {
        $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      } as never,
      {
        resolve: vi.fn().mockResolvedValue({
          hasPassed,
          cutoffAt: new Date('2026-01-05T10:30:00Z'),
        }),
      } as never,
      {
        assertDateString: (value: string) => value,
        fromDateString: () => new Date('2026-01-07T00:00:00Z'),
        toTimeString: () => '12:30',
        combineDateAndTime: () => new Date('2026-01-07T07:00:00Z'),
        now: () => new Date('2026-10-03T12:00:00Z'),
      } as never,
    );

    return { service, tx };
  }

  it('does nothing when the cutoff has not passed', async () => {
    const { service, tx } = setup(false);
    const result = await service.ensureProcessed(FUTURE);

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('CUTOFF_NOT_PASSED');
    expect(tx.order.findMany).not.toHaveBeenCalled();
  });

  it('skips when kitchen holidays push the cutoff into the future', async () => {
    const { service, tx } = setup(false);
    const result = await service.ensureProcessed(PAST);

    expect(result.reason).toBe('CUTOFF_NOT_PASSED');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('cancels drafts, confirms placed orders, upserts one drop, and is idempotent', async () => {
    const { service, tx } = setup(true);
    const first = await service.ensureProcessed(PAST);

    expect(first.processed).toBe(true);
    expect(first.cancelled).toBe(1);
    expect(first.confirmed).toBe(1);
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.drop.upsert).toHaveBeenCalledTimes(1);
    expect(tx.orderEvent.create).toHaveBeenCalledTimes(2);

    tx.cutoffRun.findFirst.mockResolvedValue({
      cutoffAt: new Date('2026-01-05T10:30:00Z'),
      ordersConfirmed: 1,
      ordersRejected: 1,
      status: 'COMPLETED',
    });

    const second = await service.ensureProcessed(PAST);
    expect(second.alreadyProcessed).toBe(true);
    expect(tx.orderEvent.create).toHaveBeenCalledTimes(2);
    expect(tx.drop.upsert).toHaveBeenCalledTimes(1);
  });
});
