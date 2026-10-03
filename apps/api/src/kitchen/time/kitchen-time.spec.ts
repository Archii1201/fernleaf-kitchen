import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { InvalidDateStringError, InvalidTimeStringError } from '../kitchen.errors.js';
import { CLOCK, FixedClock } from './clock.js';
import { KitchenTime } from './kitchen-time.js';

describe('KitchenTime', () => {
  let kitchenTime: KitchenTime;
  let clock: FixedClock;

  beforeEach(async () => {
    clock = new FixedClock(new Date('2026-10-07T18:45:00.000Z'));

    const moduleRef = await Test.createTestingModule({
      providers: [
        KitchenTime,
        { provide: CLOCK, useValue: clock },
        {
          provide: ConfigService,
          useValue: { get: () => 'Asia/Kolkata' },
        },
      ],
    }).compile();

    kitchenTime = moduleRef.get(KitchenTime);
  });

  it('reports today in the application timezone, not UTC', () => {
    // 2026-10-07T18:45Z is already the 8th in Asia/Kolkata (UTC+5:30).
    expect(kitchenTime.today()).toBe('2026-10-08');
  });

  it('round-trips @db.Date values through UTC midnight', () => {
    const stored = kitchenTime.fromDateString('2026-10-07');

    expect(stored.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(kitchenTime.toDateString(stored)).toBe('2026-10-07');
  });

  it('round-trips @db.Time values anchored to 1970-01-01', () => {
    const stored = kitchenTime.fromTimeString('16:00');

    expect(stored.toISOString()).toBe('1970-01-01T16:00:00.000Z');
    expect(kitchenTime.toTimeString(stored)).toBe('16:00');
  });

  it('combines a date and a local time into the correct instant', () => {
    const instant = kitchenTime.combineDateAndTime('2026-10-05', '16:00');

    expect(instant.toISOString()).toBe('2026-10-05T10:30:00.000Z');
  });

  it('resolves the weekday of a business date', () => {
    expect(kitchenTime.weekdayOf('2026-10-07')).toBe('WEDNESDAY');
  });

  it('compares instants against the injected clock', () => {
    expect(kitchenTime.hasPassed(new Date('2026-10-07T18:44:00.000Z'))).toBe(
      true,
    );
    expect(kitchenTime.hasPassed(new Date('2026-10-07T18:46:00.000Z'))).toBe(
      false,
    );
  });

  it('rejects malformed dates and times', () => {
    expect(() => kitchenTime.fromDateString('07-10-2026')).toThrow(
      InvalidDateStringError,
    );
    expect(() => kitchenTime.fromTimeString('25:00')).toThrow(
      InvalidTimeStringError,
    );
  });
});
