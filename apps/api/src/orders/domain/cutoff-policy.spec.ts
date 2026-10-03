import { describe, expect, it, vi } from 'vitest';
import { OrderCutoffPassedError } from '../orders.errors.js';
import { CutoffPolicy } from './cutoff-policy.js';

describe('CutoffPolicy', () => {
  const cutoffAt = new Date('2031-03-03T10:30:00Z');

  function policy(hasPassed: boolean, kitchenOpen = true) {
    return new CutoffPolicy(
      {
        resolve: vi.fn().mockResolvedValue({
          deliveryDate: '2031-03-05',
          cutoffDate: '2031-03-03',
          cutoffAt,
          hasPassed,
          cutoffTime: '16:00',
          cutoffWorkingDays: 2,
        }),
      } as never,
      { isWorkingDay: vi.fn().mockResolvedValue(kitchenOpen) } as never,
    );
  }

  it('allows edits before cutoff', async () => {
    await expect(policy(false).assertBeforeCutoff('2031-03-05')).resolves.toMatchObject(
      { hasPassed: false },
    );
  });

  it('blocks edits after cutoff', async () => {
    await expect(policy(true).assertBeforeCutoff('2031-03-05')).rejects.toBeInstanceOf(
      OrderCutoffPassedError,
    );
  });

  it('reports kitchen holidays and closed weekdays via the kitchen calendar', async () => {
    expect(await policy(false, false).isKitchenOperating('2031-03-08')).toBe(
      false,
    );
    expect(await policy(false, true).isKitchenOperating('2031-03-05')).toBe(
      true,
    );
  });
});
