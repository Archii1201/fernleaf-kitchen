import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { calculateCutoff, type CutoffInput } from '../cutoff/cutoff-calculator.js';
import { CLOCK, FixedClock } from './clock.js';
import { KitchenTime } from './kitchen-time.js';
import { type Weekday } from './weekday.js';

const MON_TO_FRI: Weekday[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];

const MON_TO_SAT: Weekday[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

const KOLKATA = 'Asia/Kolkata';
const NEW_YORK = 'America/New_York';

function buildKitchenTime(timeZone = KOLKATA, instant = '2026-10-05T10:00:00.000Z'): KitchenTime {
  const clock = new FixedClock(new Date(instant));
  const config = { get: () => timeZone };
  return new KitchenTime(config as never, clock);
}

function cutoffConfig(overrides: Partial<CutoffInput> = {}): CutoffInput {
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

describe('Step 24 Part 1: Kitchen Time Tests', () => {
  describe('Case A — Monday: Normal working Monday behavior', () => {
    it('correctly resolves weekday as MONDAY and computes cutoff across weekend', () => {
      const kt = buildKitchenTime(KOLKATA, '2026-10-05T06:00:00.000Z');
      expect(kt.weekdayOf('2026-10-05')).toBe('MONDAY');

      // Monday delivery with 1 working day lead time falls on Friday before the weekend
      const result1Day = calculateCutoff(
        cutoffConfig({
          deliveryDate: '2026-10-05',
          cutoffWorkingDays: 1,
          cutoffTime: '16:00',
        }),
      );
      expect(result1Day.cutoffDate).toBe('2026-10-02'); // Friday
      expect(DateTime.fromJSDate(result1Day.cutoffAt, { zone: KOLKATA }).toFormat('yyyy-MM-dd HH:mm')).toBe(
        '2026-10-02 16:00',
      );

      // Monday delivery with 0 working days lead time falls on Monday itself
      const resultSameDay = calculateCutoff(
        cutoffConfig({
          deliveryDate: '2026-10-05',
          cutoffWorkingDays: 0,
          cutoffTime: '11:00',
        }),
      );
      expect(resultSameDay.cutoffDate).toBe('2026-10-05');
      expect(DateTime.fromJSDate(resultSameDay.cutoffAt, { zone: KOLKATA }).toFormat('yyyy-MM-dd HH:mm')).toBe(
        '2026-10-05 11:00',
      );
    });
  });

  describe('Case B — Tuesday: Normal weekday behavior', () => {
    it('correctly resolves weekday as TUESDAY and walks back working days', () => {
      const kt = buildKitchenTime(KOLKATA, '2026-10-06T06:00:00.000Z');
      expect(kt.weekdayOf('2026-10-06')).toBe('TUESDAY');

      // Tuesday delivery with 1 working day lead time -> Monday
      const result1Day = calculateCutoff(
        cutoffConfig({
          deliveryDate: '2026-10-06',
          cutoffWorkingDays: 1,
          cutoffTime: '15:30',
        }),
      );
      expect(result1Day.cutoffDate).toBe('2026-10-05'); // Monday
      expect(DateTime.fromJSDate(result1Day.cutoffAt, { zone: KOLKATA }).toFormat('yyyy-MM-dd HH:mm')).toBe(
        '2026-10-05 15:30',
      );

      // Tuesday delivery with 2 working days lead time -> walks past Monday back to Friday
      const result2Days = calculateCutoff(
        cutoffConfig({
          deliveryDate: '2026-10-06',
          cutoffWorkingDays: 2,
          cutoffTime: '16:00',
        }),
      );
      expect(result2Days.cutoffDate).toBe('2026-10-02'); // Friday
    });
  });

  describe('Case C — Weekend: Saturday and Sunday configuration', () => {
    it('skips Saturday and Sunday when kitchen works Monday to Friday', () => {
      const kt = buildKitchenTime();
      expect(kt.weekdayOf('2026-10-10')).toBe('SATURDAY');
      expect(kt.weekdayOf('2026-10-11')).toBe('SUNDAY');

      // Monday 2026-10-12 delivery with 2 working days:
      // skips Sunday 11th and Saturday 10th, counting Friday 9th and Thursday 8th
      const resultMonToFri = calculateCutoff(
        cutoffConfig({
          deliveryDate: '2026-10-12',
          cutoffWorkingDays: 2,
          kitchenWorkingDays: MON_TO_FRI,
        }),
      );
      expect(resultMonToFri.cutoffDate).toBe('2026-10-08'); // Thursday
    });

    it('counts Saturday as a working day when kitchen is configured Monday to Saturday', () => {
      // Monday 2026-10-12 delivery with 1 working day:
      // With Saturday as working day, skips Sunday 11th and lands on Saturday 10th!
      const resultMonToSat = calculateCutoff(
        cutoffConfig({
          deliveryDate: '2026-10-12',
          cutoffWorkingDays: 1,
          kitchenWorkingDays: MON_TO_SAT,
        }),
      );
      expect(resultMonToSat.cutoffDate).toBe('2026-10-10'); // Saturday is included!
    });
  });

  describe('Case D — Holiday: Single kitchen holiday is skipped', () => {
    it('skips a configured kitchen holiday when computing cutoff', () => {
      // Thursday 2026-10-08 delivery with 1 working day lead time.
      // Wednesday 2026-10-07 is a kitchen holiday.
      // Cutoff must skip Wednesday and resolve to Tuesday 2026-10-06.
      const result = calculateCutoff(
        cutoffConfig({
          deliveryDate: '2026-10-08',
          cutoffWorkingDays: 1,
          kitchenHolidays: ['2026-10-07'],
        }),
      );
      expect(result.cutoffDate).toBe('2026-10-06'); // Tuesday
    });
  });

  describe('Case E — Multiple holidays: Sequence of consecutive holidays', () => {
    it('skips both Monday and Tuesday holidays for Wednesday delivery', () => {
      // Requirement example:
      // Monday 2026-10-05 = holiday
      // Tuesday 2026-10-06 = holiday
      // Wednesday 2026-10-07 = working day delivery
      // 1 working day lead time:
      // Tuesday is skipped (holiday), Monday is skipped (holiday),
      // Sunday and Saturday are skipped (weekend).
      // Cutoff must land on Friday 2026-10-02!
      const resultWed = calculateCutoff(
        cutoffConfig({
          deliveryDate: '2026-10-07', // Wednesday
          cutoffWorkingDays: 1,
          kitchenHolidays: ['2026-10-05', '2026-10-06'],
        }),
      );
      expect(resultWed.cutoffDate).toBe('2026-10-02'); // Previous Friday!
    });

    it('skips consecutive holidays with multiple lead days', () => {
      // Thursday 2026-10-08 delivery with 2 working days lead time:
      // Wednesday 2026-10-07 is working day (1).
      // Tuesday 2026-10-06 is holiday (skipped).
      // Monday 2026-10-05 is holiday (skipped).
      // Weekend skipped.
      // Friday 2026-10-02 is working day (2).
      const resultThu = calculateCutoff(
        cutoffConfig({
          deliveryDate: '2026-10-08', // Thursday
          cutoffWorkingDays: 2,
          kitchenHolidays: ['2026-10-05', '2026-10-06'],
        }),
      );
      expect(resultThu.cutoffDate).toBe('2026-10-02'); // Friday
    });
  });

  describe('Case F — DST timezone abstraction (America/New_York)', () => {
    it('correctly handles US DST Fall-back transition without wall-clock drift', () => {
      // In 2026, US DST ends on Sunday 2026-11-01 (EDT -> EST).
      // Before transition: EDT (UTC-4)
      // After transition: EST (UTC-5)
      const nyKitchenTime = buildKitchenTime(NEW_YORK);

      // Before transition: Saturday 2026-10-31 at 16:00 EDT
      const beforeDst = nyKitchenTime.combineDateAndTime('2026-10-31', '16:00');
      expect(beforeDst.toISOString()).toBe('2026-10-31T20:00:00.000Z'); // 16:00 + 4 = 20:00Z

      // After transition: Monday 2026-11-02 at 16:00 EST
      const afterDst = nyKitchenTime.combineDateAndTime('2026-11-02', '16:00');
      expect(afterDst.toISOString()).toBe('2026-11-02T21:00:00.000Z'); // 16:00 + 5 = 21:00Z

      // Cutoff calculation across the DST boundary:
      // Delivery on Wednesday 2026-11-04 with 2 working days in America/New_York
      const cutoffAcrossDst = calculateCutoff(
        cutoffConfig({
          deliveryDate: '2026-11-04',
          cutoffWorkingDays: 2,
          cutoffTime: '16:00',
          timeZone: NEW_YORK,
        }),
      );
      expect(cutoffAcrossDst.cutoffDate).toBe('2026-11-02');
      // Local time in New York must remain exactly 16:00
      expect(
        DateTime.fromJSDate(cutoffAcrossDst.cutoffAt, { zone: NEW_YORK }).toFormat('yyyy-MM-dd HH:mm'),
      ).toBe('2026-11-02 16:00');
      expect(cutoffAcrossDst.cutoffAt.toISOString()).toBe('2026-11-02T21:00:00.000Z');
    });

    it('correctly handles US DST Spring-forward transition without wall-clock drift', () => {
      // In 2026, US DST starts on Sunday 2026-03-08 (EST -> EDT).
      const nyKitchenTime = buildKitchenTime(NEW_YORK);

      // Before spring forward: Saturday 2026-03-07 at 16:00 EST (UTC-5)
      const beforeSpring = nyKitchenTime.combineDateAndTime('2026-03-07', '16:00');
      expect(beforeSpring.toISOString()).toBe('2026-03-07T21:00:00.000Z'); // 16:00 + 5 = 21:00Z

      // After spring forward: Monday 2026-03-09 at 16:00 EDT (UTC-4)
      const afterSpring = nyKitchenTime.combineDateAndTime('2026-03-09', '16:00');
      expect(afterSpring.toISOString()).toBe('2026-03-09T20:00:00.000Z'); // 16:00 + 4 = 20:00Z

      // Cutoff calculation across the spring boundary:
      // Delivery on Tuesday 2026-03-10 with 1 working day in America/New_York
      const cutoffSpring = calculateCutoff(
        cutoffConfig({
          deliveryDate: '2026-03-10',
          cutoffWorkingDays: 1,
          cutoffTime: '16:00',
          timeZone: NEW_YORK,
        }),
      );
      expect(cutoffSpring.cutoffDate).toBe('2026-03-09');
      expect(
        DateTime.fromJSDate(cutoffSpring.cutoffAt, { zone: NEW_YORK }).toFormat('yyyy-MM-dd HH:mm'),
      ).toBe('2026-03-09 16:00');
      expect(cutoffSpring.cutoffAt.toISOString()).toBe('2026-03-09T20:00:00.000Z');
    });
  });
});
