import { DateTime } from 'luxon';
import {
  InvalidDateStringError,
  InvalidTimeStringError,
  UnresolvableCutoffError,
} from '../kitchen.errors.js';
import { weekdayFromLuxon, type Weekday } from '../time/weekday.js';

/** Designed range for the cutoff working-day count. */
export const MIN_CUTOFF_WORKING_DAYS = 0;
export const MAX_CUTOFF_WORKING_DAYS = 14;

/** Safety stop so a misconfigured calendar cannot loop forever. */
const MAX_LOOKBACK_DAYS = 400;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export interface CutoffInput {
  /** Delivery date as `YYYY-MM-DD`. */
  deliveryDate: string;
  /** How many kitchen working days before delivery the cutoff falls. */
  cutoffWorkingDays: number;
  /** Local cutoff time as `HH:mm`. */
  cutoffTime: string;
  kitchenWorkingDays: readonly Weekday[];
  /** Kitchen holidays as `YYYY-MM-DD`. */
  kitchenHolidays: readonly string[];
  timeZone: string;
}

export interface CutoffResult {
  deliveryDate: string;
  cutoffDate: string;
  cutoffAt: Date;
}

/**
 * Pure cutoff calculation: no clock, no database, no HTTP.
 *
 * Counts backwards from the delivery date across **kitchen** working days
 * only, skipping non-working weekdays and kitchen holidays, then places the
 * cutoff time on that date in the application timezone. Company working days
 * are irrelevant here - they describe when a customer can *receive*, which is
 * a separate question from when the kitchen locks an order.
 *
 * Wednesday delivery + 2 working days + 16:00 (Mon-Fri kitchen) -> Monday 16:00.
 */
export function calculateCutoff(input: CutoffInput): CutoffResult {
  const workingWeekdays = new Set(input.kitchenWorkingDays);
  const holidays = new Set(input.kitchenHolidays);

  let cursor = parseDeliveryDate(input.deliveryDate, input.timeZone);

  let counted = 0;
  let scanned = 0;

  while (counted < input.cutoffWorkingDays) {
    cursor = cursor.minus({ days: 1 });
    scanned += 1;

    if (scanned > MAX_LOOKBACK_DAYS) {
      throw new UnresolvableCutoffError(input.deliveryDate);
    }

    if (isKitchenWorkingDay(cursor, workingWeekdays, holidays)) {
      counted += 1;
    }
  }

  const { hour, minute, second } = parseTime(input.cutoffTime);

  return {
    deliveryDate: input.deliveryDate,
    cutoffDate: cursor.toISODate()!,
    cutoffAt: cursor
      .set({ hour, minute, second, millisecond: 0 })
      .toJSDate(),
  };
}

function isKitchenWorkingDay(
  day: DateTime,
  workingWeekdays: ReadonlySet<Weekday>,
  holidays: ReadonlySet<string>,
): boolean {
  return (
    workingWeekdays.has(weekdayFromLuxon(day.weekday)) &&
    !holidays.has(day.toISODate()!)
  );
}

function parseDeliveryDate(value: string, timeZone: string): DateTime {
  const parsed = DateTime.fromISO(value, { zone: timeZone });

  if (!parsed.isValid || value.length !== 10) {
    throw new InvalidDateStringError(value);
  }

  return parsed.startOf('day');
}

function parseTime(value: string): {
  hour: number;
  minute: number;
  second: number;
} {
  const match = TIME_PATTERN.exec(value);

  if (!match) {
    throw new InvalidTimeStringError(value);
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] ?? 0),
  };
}
