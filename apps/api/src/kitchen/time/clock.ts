/**
 * The only source of "now" in the application. Injecting it keeps every
 * cutoff-sensitive decision testable: a test swaps in a `FixedClock` instead
 * of waiting for a real date to arrive.
 */
export interface Clock {
  now(): Date;
}

/** DI token, because `Clock` is an interface and has no runtime value. */
export const CLOCK = 'CLOCK';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  set(instant: Date): void {
    this.current = instant;
  }
}
