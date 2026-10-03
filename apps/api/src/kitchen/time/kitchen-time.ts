import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { Env } from '../../config/env.schema.js';
import { InvalidDateStringError, InvalidTimeStringError } from '../kitchen.errors.js';
import { CLOCK, type Clock } from './clock.js';
import { weekdayFromLuxon, type Weekday } from './weekday.js';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

/**
 * Every date/time decision in the application goes through here.
 *
 * Two rules it exists to enforce:
 *  - business dates are evaluated in the configured application timezone
 *    (`TIMEZONE`, Asia/Kolkata), never in the server's or the browser's zone;
 *  - Prisma `@db.Date` and `@db.Time` values are UTC-anchored wrappers
 *    (`1970-01-01T16:00:00Z` means 16:00 local, `2026-10-07T00:00:00Z` means
 *    the 7th), so they are read and written with UTC accessors only.
 */
@Injectable()
export class KitchenTime {
  readonly timeZone: string;

  constructor(
    configService: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.timeZone = configService.get('TIMEZONE', { infer: true });
  }

  now(): Date {
    return this.clock.now();
  }

  /** Today's business date in the application timezone. */
  today(): string {
    return this.zoned(this.clock.now()).toISODate()!;
  }

  weekdayOf(date: string): Weekday {
    return weekdayFromLuxon(this.parseDate(date).weekday);
  }

  /** Reads a `@db.Date` column into a `YYYY-MM-DD` string. */
  toDateString(value: Date): string {
    return DateTime.fromJSDate(value, { zone: 'utc' }).toISODate()!;
  }

  /** Writes a `YYYY-MM-DD` string into a `@db.Date` column. */
  fromDateString(value: string): Date {
    return this.parseDate(value).toJSDate();
  }

  /** The instant at which the given business date starts locally. */
  startOfDay(value: string): Date {
    return DateTime.fromISO(value, { zone: this.timeZone })
      .startOf('day')
      .toJSDate();
  }

  /** The instant of `HH:mm` on the given business date, in the app timezone. */
  combineDateAndTime(date: string, time: string): Date {
    const { hour, minute, second } = this.parseTime(time);

    return DateTime.fromISO(date, { zone: this.timeZone })
      .startOf('day')
      .set({ hour, minute, second, millisecond: 0 })
      .toJSDate();
  }

  /** Reads a `@db.Time` column into `HH:mm`. */
  toTimeString(value: Date): string {
    return DateTime.fromJSDate(value, { zone: 'utc' }).toFormat('HH:mm');
  }

  /** Writes `HH:mm` into a `@db.Time` column. */
  fromTimeString(value: string): Date {
    const { hour, minute, second } = this.parseTime(value);

    return DateTime.fromObject(
      { year: 1970, month: 1, day: 1, hour, minute, second },
      { zone: 'utc' },
    ).toJSDate();
  }

  hasPassed(instant: Date): boolean {
    return instant.getTime() <= this.clock.now().getTime();
  }

  assertDateString(value: string): string {
    this.parseDate(value);

    return value;
  }

  private zoned(instant: Date): DateTime {
    return DateTime.fromJSDate(instant, { zone: this.timeZone });
  }

  /** `@db.Date` values are UTC midnight, so date-only parsing uses UTC. */
  private parseDate(value: string): DateTime {
    const parsed = DateTime.fromISO(value, { zone: 'utc' });

    if (!parsed.isValid || value.length !== 10) {
      throw new InvalidDateStringError(value);
    }

    return parsed.startOf('day');
  }

  private parseTime(value: string): {
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
}
