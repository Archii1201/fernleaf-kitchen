import { describe, expect, it } from 'vitest';
import { MoneyError } from '../pricing.errors.js';
import { BASIS_POINTS_SCALE, Money, roundUpRational } from './money.js';

describe('Money', () => {
  it('rejects fractional cents', () => {
    expect(() => Money.fromCents(10.5)).toThrow(MoneyError);
  });

  it('rejects negative amounts', () => {
    expect(() => Money.fromCents(-1)).toThrow(MoneyError);
  });

  it('rounds up to the next 5 cents', () => {
    expect(roundUpRational(211, 1)).toBe(215);
    expect(roundUpRational(212, 1)).toBe(215);
    expect(roundUpRational(1, 1)).toBe(5);
  });

  it('leaves an exact multiple of 5 cents unchanged', () => {
    expect(roundUpRational(215, 1)).toBe(215);
    expect(roundUpRational(1000, 1)).toBe(1000);
    expect(Money.fromCents(0).roundUpToStep().cents).toBe(0);
  });

  it('scales by basis points without floating-point error', () => {
    // $0.88 x 2.4 = 211.2 cents, which must become 215, not 210 or 211.
    expect(Money.fromCents(88).scaleByBasisPointsRoundedUp(24_000).cents).toBe(
      215,
    );
    // +15% on $8.99 = 1033.85 cents -> 1035.
    expect(
      Money.fromCents(899).scaleByBasisPointsRoundedUp(
        BASIS_POINTS_SCALE + 1_500,
      ).cents,
    ).toBe(1035);
  });

  it('formats as a currency string for logs and UI copy', () => {
    expect(Money.fromCents(215).toString()).toBe('$2.15');
    expect(Money.fromCents(1035).toString()).toBe('$10.35');
  });
});
