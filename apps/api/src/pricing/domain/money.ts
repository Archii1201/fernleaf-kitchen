import { MoneyError } from '../pricing.errors.js';

/** Derived prices are rounded up to the next multiple of this many cents. */
export const ROUNDING_STEP_CENTS = 5;

/** 100% expressed in basis points. Percentages never become floats. */
export const BASIS_POINTS_SCALE = 10_000;

/**
 * An amount of money, always a whole number of cents.
 *
 * Money is never a float anywhere in this codebase. Percentages and
 * multipliers are basis points (integers), and every division happens inside
 * this file through `divideRoundingUp`, so no intermediate float ever exists
 * to accumulate a rounding error.
 */
export class Money {
  private constructor(readonly cents: number) {}

  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents)) {
      throw new MoneyError('Money must be a whole number of cents.', { cents });
    }

    if (cents < 0) {
      throw new MoneyError('Money cannot be negative.', { cents });
    }

    if (!Number.isSafeInteger(cents)) {
      throw new MoneyError('Money is out of the safe integer range.', { cents });
    }

    return new Money(cents);
  }

  static zero(): Money {
    return new Money(0);
  }

  plus(other: Money): Money {
    return Money.fromCents(this.cents + other.cents);
  }

  times(factor: number): Money {
    if (!Number.isInteger(factor) || factor < 0) {
      throw new MoneyError('Money can only be multiplied by a whole count.', {
        factor,
      });
    }

    return Money.fromCents(this.cents * factor);
  }

  /**
   * Scales by basis points and rounds the result up to the next
   * `ROUNDING_STEP_CENTS`, in one exact integer operation.
   *
   * `$0.88 x 2.4` is `88` scaled by `24000` bp: `88 * 24000 = 2_112_000`, and
   * `ceil(2_112_000 / 50_000) * 5 = 215` cents. The true value (211.2) is
   * never materialised, so there is nothing to round twice.
   */
  scaleByBasisPointsRoundedUp(basisPoints: number): Money {
    assertBasisPoints(basisPoints);

    return Money.fromCents(
      roundUpRational(this.cents * basisPoints, BASIS_POINTS_SCALE),
    );
  }

  /** Rounds an already-whole amount up to the next `ROUNDING_STEP_CENTS`. */
  roundUpToStep(): Money {
    return Money.fromCents(roundUpRational(this.cents, 1));
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  toString(): string {
    const sign = this.cents < 0 ? '-' : '';
    const absolute = Math.abs(this.cents);

    return `${sign}$${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
  }
}

/**
 * The single round-up-to-5-cents implementation.
 *
 * Computes `ceil((numerator / denominator) / STEP) * STEP` without leaving
 * integer arithmetic: `ceil(a / b)` is `Math.ceil(a / b)` only when `a / b` is
 * exactly representable, so the division is done on the already-scaled
 * denominator and the ceiling is taken with integer remainder logic.
 */
export function roundUpRational(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new MoneyError('Rounding operates on integers only.', {
      numerator,
      denominator,
    });
  }

  if (denominator <= 0) {
    throw new MoneyError('Rounding denominator must be positive.', {
      denominator,
    });
  }

  if (numerator < 0) {
    throw new MoneyError('Rounding operates on non-negative amounts only.', {
      numerator,
    });
  }

  const scaledDenominator = denominator * ROUNDING_STEP_CENTS;
  const steps =
    Math.trunc(numerator / scaledDenominator) +
    (numerator % scaledDenominator === 0 ? 0 : 1);

  return steps * ROUNDING_STEP_CENTS;
}

export function assertBasisPoints(basisPoints: number): void {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new MoneyError(
      'Basis points must be a non-negative whole number (10000 = 100%).',
      { basisPoints },
    );
  }
}
