import { describe, expect, it } from 'vitest';
import { applyCredits, creditCapacity } from './invoice-money.js';

describe('invoice money', () => {
  it('applies fitting credits and never goes negative', () => {
    const result = applyCredits(5000, [
      { id: 'a', amountCents: 2000 },
      { id: 'b', amountCents: 4000 },
      { id: 'c', amountCents: 1000 },
    ]);

    expect(result.creditCents).toBe(3000);
    expect(result.totalCents).toBe(2000);
    expect(result.appliedIds).toEqual(['a', 'c']);
  });

  it('rejects a credit that would exceed the order total', () => {
    expect(creditCapacity(2099, 1000)).toBe(1099);
    expect(creditCapacity(2099, 2099)).toBe(0);
  });
});
