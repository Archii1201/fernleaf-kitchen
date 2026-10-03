import { describe, expect, it, vi } from 'vitest';
import { PrepUnitConflictError } from '../kitchen.errors.js';
import { KitchenBoardService } from './kitchen-board.service.js';

describe('KitchenBoardService', () => {
  it('starts a pending unit once and rejects a second start', async () => {
    const unit = {
      id: 'u1',
      status: 'PENDING',
      startedAt: null,
      completedAt: null,
      order: { id: 'o1', status: 'CONFIRMED', kitchenStartedAt: null },
    };
    const tx = {
      $executeRaw: vi.fn(),
      prepUnit: {
        findUnique: vi.fn().mockResolvedValue(unit),
        update: vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => {
          unit.status = data.status;
        }),
        count: vi.fn().mockResolvedValue(1),
      },
      order: {
        update: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'o1', status: 'IN_KITCHEN' }),
      },
      orderEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };

    const service = new KitchenBoardService(
      { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as never,
      { now: () => new Date('2026-10-07T05:00:00Z') } as never,
    );

    await service.start('u1');
    await expect(service.start('u1')).rejects.toBeInstanceOf(PrepUnitConflictError);
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kitchenStartedAt: expect.any(Date) }),
      }),
    );
  });

  it('records startedAt when completing a pending unit and becomes ready only when all are done', async () => {
    const unit = {
      id: 'u1',
      status: 'PENDING',
      startedAt: null,
      completedAt: null,
      order: { id: 'o1', status: 'IN_KITCHEN', kitchenStartedAt: new Date() },
    };
    const tx = {
      $executeRaw: vi.fn(),
      prepUnit: {
        findUnique: vi.fn().mockResolvedValue(unit),
        update: vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => {
          unit.status = data.status;
        }),
        count: vi.fn().mockResolvedValueOnce(0),
      },
      order: {
        update: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'o1', status: 'READY' }),
      },
      orderEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };

    const service = new KitchenBoardService(
      { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as never,
      { now: () => new Date('2026-10-07T05:00:00Z') } as never,
    );

    await service.done('u1');
    expect(tx.prepUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'READY',
          startedAt: expect.any(Date),
          completedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'READY' } }),
    );

    await expect(service.done('u1')).rejects.toBeInstanceOf(PrepUnitConflictError);
  });

  it('does not mark the order ready while another unit is unfinished', async () => {
    const unit = {
      id: 'u1',
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      completedAt: null,
      order: { id: 'o1', status: 'IN_KITCHEN', kitchenStartedAt: new Date() },
    };
    const tx = {
      $executeRaw: vi.fn(),
      prepUnit: {
        findUnique: vi.fn().mockResolvedValue(unit),
        update: vi.fn(),
        count: vi.fn().mockResolvedValue(1),
      },
      order: {
        update: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'o1', status: 'IN_KITCHEN' }),
      },
      orderEvent: { findFirst: vi.fn(), create: vi.fn() },
    };

    const service = new KitchenBoardService(
      { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as never,
      { now: () => new Date('2026-10-07T05:00:00Z') } as never,
    );

    await service.done('u1');
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('force-completes remaining units and leaves already-done timestamps alone', async () => {
    const doneAt = new Date('2026-10-07T04:00:00Z');
    const tx = {
      $executeRaw: vi.fn(),
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'o1',
          status: 'IN_KITCHEN',
          kitchenStartedAt: new Date('2026-10-07T03:00:00Z'),
          prepUnits: [
            { id: 'done', status: 'READY', startedAt: doneAt, completedAt: doneAt },
            { id: 'open', status: 'PENDING', startedAt: null, completedAt: null },
          ],
        }),
        update: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'o1',
          status: 'READY',
          prepUnits: [
            { id: 'done', completedAt: doneAt },
            { id: 'open', completedAt: new Date('2026-10-07T05:00:00Z') },
          ],
        }),
      },
      prepUnit: {
        update: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      orderEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };

    const service = new KitchenBoardService(
      { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as never,
      { now: () => new Date('2026-10-07T05:00:00Z') } as never,
    );

    await service.forceComplete('o1');
    expect(tx.prepUnit.update).toHaveBeenCalledTimes(1);
    expect(tx.prepUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'open' } }),
    );
  });
});
