import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  DuplicateHolidayError,
  HolidayNotFoundError,
  InvalidCutoffConfigurationError,
  InvalidTimeStringError,
  InvalidWorkingDaysError,
  SettingsNotInitializedError,
} from '../kitchen.errors.js';
import { CLOCK, FixedClock } from '../time/clock.js';
import { KitchenTime } from '../time/kitchen-time.js';
import type { Weekday } from '../time/weekday.js';
import { SettingsService } from './settings.service.js';

function createPrismaMock() {
  return {
    kitchenSettings: { findUnique: vi.fn(), upsert: vi.fn() },
    kitchenWorkingDay: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    kitchenHoliday: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        KitchenTime,
        { provide: CLOCK, useValue: new FixedClock(new Date('2026-10-07T06:00:00Z')) },
        { provide: ConfigService, useValue: { get: () => 'Asia/Kolkata' } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(SettingsService);
  });

  const workingDays: Weekday[] = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
  ];

  it('reads the singleton settings row with its working week', async () => {
    prisma.kitchenSettings.findUnique.mockResolvedValue({
      cutoffTime: new Date('1970-01-01T16:00:00Z'),
      cutoffWorkingDays: 2,
      updatedAt: new Date('2026-10-01T00:00:00Z'),
    });
    prisma.kitchenWorkingDay.findMany.mockResolvedValue([
      { weekday: 'WEDNESDAY' },
      { weekday: 'MONDAY' },
    ]);

    const settings = await service.get();

    expect(settings.cutoffTime).toBe('16:00');
    expect(settings.cutoffWorkingDays).toBe(2);
    expect(settings.timeZone).toBe('Asia/Kolkata');
    expect(settings.workingDays).toEqual(['MONDAY', 'WEDNESDAY']);
  });

  it('fails clearly when settings have never been seeded', async () => {
    prisma.kitchenSettings.findUnique.mockResolvedValue(null);

    await expect(service.get()).rejects.toThrow(SettingsNotInitializedError);
    await expect(service.getCutoffConfig()).rejects.toThrow(
      SettingsNotInitializedError,
    );
  });

  it('rejects an empty working week', async () => {
    await expect(
      service.update({ cutoffTime: '16:00', cutoffWorkingDays: 2, workingDays: [] }),
    ).rejects.toThrow(InvalidWorkingDaysError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate weekdays', async () => {
    await expect(
      service.update({
        cutoffTime: '16:00',
        cutoffWorkingDays: 2,
        workingDays: ['MONDAY', 'MONDAY'],
      }),
    ).rejects.toThrow(InvalidWorkingDaysError);
  });

  it('rejects an out-of-range cutoff working-day count', async () => {
    await expect(
      service.update({ cutoffTime: '16:00', cutoffWorkingDays: 99, workingDays }),
    ).rejects.toThrow(InvalidCutoffConfigurationError);
  });

  it('rejects a malformed cutoff time', async () => {
    await expect(
      service.update({ cutoffTime: '7pm', cutoffWorkingDays: 2, workingDays }),
    ).rejects.toThrow(InvalidTimeStringError);
  });

  it('replaces settings and the working week in one transaction', async () => {
    prisma.kitchenSettings.findUnique.mockResolvedValue({
      cutoffTime: new Date('1970-01-01T16:00:00Z'),
      cutoffWorkingDays: 2,
      updatedAt: new Date('2026-10-01T00:00:00Z'),
    });
    prisma.kitchenWorkingDay.findMany.mockResolvedValue(
      workingDays.map((weekday) => ({ weekday })),
    );

    await service.update({
      cutoffTime: '16:00',
      cutoffWorkingDays: 2,
      workingDays,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.kitchenWorkingDay.deleteMany).toHaveBeenCalledWith({
      where: { weekday: { notIn: workingDays } },
    });
    expect(prisma.kitchenWorkingDay.upsert).toHaveBeenCalledTimes(5);
    expect(prisma.kitchenSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          cutoffTime: new Date('1970-01-01T16:00:00Z'),
          cutoffWorkingDays: 2,
        },
      }),
    );
  });

  it('refuses to add the same holiday twice', async () => {
    prisma.kitchenHoliday.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(service.addHoliday({ date: '2026-12-25' })).rejects.toThrow(
      DuplicateHolidayError,
    );
    expect(prisma.kitchenHoliday.create).not.toHaveBeenCalled();
  });

  it('stores holidays as UTC-midnight dates', async () => {
    prisma.kitchenHoliday.findUnique.mockResolvedValue(null);
    prisma.kitchenHoliday.create.mockResolvedValue({
      id: 'holiday-1',
      date: new Date('2026-12-25T00:00:00Z'),
      name: 'Christmas',
    });

    const holiday = await service.addHoliday({
      date: '2026-12-25',
      name: 'Christmas',
    });

    expect(prisma.kitchenHoliday.create).toHaveBeenCalledWith({
      data: { date: new Date('2026-12-25T00:00:00Z'), name: 'Christmas' },
    });
    expect(holiday.date).toBe('2026-12-25');
  });

  it('404s when removing an unknown holiday', async () => {
    prisma.kitchenHoliday.findUnique.mockResolvedValue(null);

    await expect(service.removeHoliday('missing')).rejects.toThrow(
      HolidayNotFoundError,
    );
    expect(prisma.kitchenHoliday.delete).not.toHaveBeenCalled();
  });
});
