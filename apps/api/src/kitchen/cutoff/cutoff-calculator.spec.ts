import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { UnresolvableCutoffError } from '../kitchen.errors.js';
import { WEEKDAYS, type Weekday } from '../time/weekday.js';
import { calculateCutoff, type CutoffInput } from './cutoff-calculator.js';

const MON_TO_FRI: Weekday[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];

const KOLKATA = 'Asia/Kolkata';

function input(overrides: Partial<CutoffInput> = {}): CutoffInput {
  return {
    deliveryDate: '2026-10-07',
    cutoffWorkingDays: 2,
    cutoffTime: '16:00',
    kitchenWorkingDays: MON_TO_FRI,
    kitchenHolidays: [],
    timeZone: KOLKATA,
    ...overrides,
  };
}

/** The wall-clock reading of an instant in a given zone, for assertions. */
function localIso(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).toFormat("yyyy-MM-dd'T'HH:mm");
}

describe('calculateCutoff', () => {
  it('places a Wednesday delivery with 2 working days on the Monday', () => {
    const result = calculateCutoff(input());

    expect(result.cutoffDate).toBe('2026-10-05');
    expect(localIso(result.cutoffAt, KOLKATA)).toBe('2026-10-05T16:00');
  });

  it('walks back over the weekend for a Monday delivery', () => {
    // 2026-10-12 is a Monday; three working days back is Wednesday the 7th.
    const result = calculateCutoff(
      input({ deliveryDate: '2026-10-12', cutoffWorkingDays: 3 }),
    );

    expect(result.cutoffDate).toBe('2026-10-07');
  });

  it('skips kitchen holidays while counting', () => {
    const result = calculateCutoff(
      input({ kitchenHolidays: ['2026-10-05', '2026-10-06'] }),
    );

    // Mon 5th and Tue 6th are holidays, so the two working days are Fri 2nd
    // and Thu 1st.
    expect(result.cutoffDate).toBe('2026-10-01');
  });

  it('moves past a Friday holiday into the previous Wednesday', () => {
    // Delivery Mon 2026-10-12, 2 working days, Fri 9th is a holiday:
    // Thu 8th and Wed 7th are counted.
    const result = calculateCutoff(
      input({
        deliveryDate: '2026-10-12',
        kitchenHolidays: ['2026-10-09'],
      }),
    );

    expect(result.cutoffDate).toBe('2026-10-07');
  });

  it('returns the delivery date itself when the count is zero', () => {
    const result = calculateCutoff(input({ cutoffWorkingDays: 0 }));

    expect(result.cutoffDate).toBe('2026-10-07');
    expect(localIso(result.cutoffAt, KOLKATA)).toBe('2026-10-07T16:00');
  });

  it('crosses a year boundary correctly', () => {
    // Mon 2027-01-04 delivery, 2 working days -> Thu 2026-12-31.
    const result = calculateCutoff(
      input({ deliveryDate: '2027-01-04', cutoffWorkingDays: 2 }),
    );

    expect(result.cutoffDate).toBe('2026-12-31');
  });

  it('keeps the local wall-clock time across a DST transition', () => {
    // US DST ends 2026-11-01; the cutoff must still read 16:00 locally.
    const result = calculateCutoff(
      input({
        deliveryDate: '2026-11-04',
        cutoffWorkingDays: 2,
        timeZone: 'America/New_York',
      }),
    );

    expect(result.cutoffDate).toBe('2026-11-02');
    expect(localIso(result.cutoffAt, 'America/New_York')).toBe(
      '2026-11-02T16:00',
    );
  });

  it('is anchored to the application timezone, not the server timezone', () => {
    const result = calculateCutoff(input());

    // 16:00 in Asia/Kolkata (UTC+5:30) is 10:30 UTC, whatever TZ the process
    // happens to run in.
    expect(result.cutoffAt.toISOString()).toBe('2026-10-05T10:30:00.000Z');
  });

  it('rejects a calendar in which no working day can be found', () => {
    expect(() =>
      calculateCutoff(input({ kitchenWorkingDays: [] })),
    ).toThrow(UnresolvableCutoffError);
  });

  it('only counts configured kitchen working days', () => {
    // A Saturday-only kitchen: one working day before Wed 2026-10-07 is
    // Sat 2026-10-03.
    const result = calculateCutoff(
      input({
        cutoffWorkingDays: 1,
        kitchenWorkingDays: ['SATURDAY'],
      }),
    );

    expect(result.cutoffDate).toBe('2026-10-03');
    expect(WEEKDAYS).toContain('SATURDAY');
  });
});
