import { Injectable } from '@nestjs/common';
import {
  paginate,
  type PaginatedResponse,
  type PaginationQueryDto,
} from '../../common/pagination/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  MAX_CUTOFF_WORKING_DAYS,
  MIN_CUTOFF_WORKING_DAYS,
} from '../cutoff/cutoff-calculator.js';
import {
  DuplicateHolidayError,
  HolidayNotFoundError,
  InvalidCutoffConfigurationError,
  InvalidWorkingDaysError,
  SettingsNotInitializedError,
} from '../kitchen.errors.js';
import { KitchenTime } from '../time/kitchen-time.js';
import { WEEKDAYS, type Weekday } from '../time/weekday.js';
import type {
  CreateHolidayDto,
  HolidayResponse,
  SettingsResponse,
  UpdateSettingsDto,
} from './dto/settings.dto.js';

/** The settings table holds exactly one row, pinned by a CHECK constraint. */
export const SETTINGS_ID = 'singleton';
export const DEFAULT_DELIVERY_GRACE_MINUTES = 15;

export interface CutoffConfig {
  cutoffTime: string;
  cutoffWorkingDays: number;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenTime: KitchenTime,
  ) {}

  async get(): Promise<SettingsResponse> {
    const [settings, workingDays] = await Promise.all([
      this.prisma.kitchenSettings.findUnique({ where: { id: SETTINGS_ID } }),
      this.prisma.kitchenWorkingDay.findMany({ select: { weekday: true } }),
    ]);

    if (!settings) {
      throw new SettingsNotInitializedError();
    }

    return {
      cutoffTime: this.kitchenTime.toTimeString(settings.cutoffTime),
      cutoffWorkingDays: settings.cutoffWorkingDays,
      deliveryGraceMinutes:
        settings.deliveryGraceMinutes ?? DEFAULT_DELIVERY_GRACE_MINUTES,
      workingDays: this.sortWeekdays(
        workingDays.map((row) => row.weekday as Weekday),
      ),
      timeZone: this.kitchenTime.timeZone,
      maxCutoffWorkingDays: MAX_CUTOFF_WORKING_DAYS,
      updatedAt: settings.updatedAt,
    };
  }

  /** Minimal projection used by the cutoff service. */
  async getCutoffConfig(): Promise<CutoffConfig> {
    const settings = await this.prisma.kitchenSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { cutoffTime: true, cutoffWorkingDays: true },
    });

    if (!settings) {
      throw new SettingsNotInitializedError();
    }

    return {
      cutoffTime: this.kitchenTime.toTimeString(settings.cutoffTime),
      cutoffWorkingDays: settings.cutoffWorkingDays,
    };
  }

  async getDeliveryGraceMinutes(): Promise<number> {
    const settings = await this.prisma.kitchenSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { deliveryGraceMinutes: true },
    });

    return settings?.deliveryGraceMinutes ?? DEFAULT_DELIVERY_GRACE_MINUTES;
  }

  /**
   * Replaces the cutoff configuration and the kitchen working week in one
   * transaction: a half-applied calendar would silently move every cutoff.
   */
  async update(dto: UpdateSettingsDto): Promise<SettingsResponse> {
    const workingDays = this.validateWorkingDays(dto.workingDays);
    this.validateCutoff(dto);

    const cutoffTime = this.kitchenTime.fromTimeString(dto.cutoffTime);

    await this.prisma.$transaction(async (tx) => {
      await tx.kitchenSettings.upsert({
        where: { id: SETTINGS_ID },
        update: {
          cutoffTime,
          cutoffWorkingDays: dto.cutoffWorkingDays,
          ...(dto.deliveryGraceMinutes === undefined
            ? {}
            : { deliveryGraceMinutes: dto.deliveryGraceMinutes }),
        },
        create: {
          id: SETTINGS_ID,
          cutoffTime,
          cutoffWorkingDays: dto.cutoffWorkingDays,
          deliveryGraceMinutes:
            dto.deliveryGraceMinutes ?? DEFAULT_DELIVERY_GRACE_MINUTES,
        },
      });

      await tx.kitchenWorkingDay.deleteMany({
        where: { weekday: { notIn: workingDays } },
      });

      for (const weekday of workingDays) {
        await tx.kitchenWorkingDay.upsert({
          where: { weekday },
          update: {},
          create: { weekday },
        });
      }
    });

    return this.get();
  }

  async listHolidays(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<HolidayResponse>> {
    const [total, rows] = await Promise.all([
      this.prisma.kitchenHoliday.count(),
      this.prisma.kitchenHoliday.findMany({
        orderBy: { date: 'asc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return paginate(
      rows.map((row) => ({
        id: row.id,
        date: this.kitchenTime.toDateString(row.date),
        name: row.name,
      })),
      { page: query.page, limit: query.limit, total },
    );
  }

  async addHoliday(dto: CreateHolidayDto): Promise<HolidayResponse> {
    const date = this.kitchenTime.fromDateString(dto.date);

    const existing = await this.prisma.kitchenHoliday.findUnique({
      where: { date },
      select: { id: true },
    });

    if (existing) {
      throw new DuplicateHolidayError(dto.date);
    }

    const created = await this.prisma.kitchenHoliday.create({
      data: { date, name: dto.name ?? null },
    });

    return {
      id: created.id,
      date: this.kitchenTime.toDateString(created.date),
      name: created.name,
    };
  }

  async removeHoliday(id: string): Promise<void> {
    const existing = await this.prisma.kitchenHoliday.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new HolidayNotFoundError(id);
    }

    await this.prisma.kitchenHoliday.delete({ where: { id } });
  }

  private validateWorkingDays(workingDays: Weekday[]): Weekday[] {
    if (workingDays.length === 0) {
      throw new InvalidWorkingDaysError(
        'The kitchen must work at least one weekday.',
      );
    }

    const unique = [...new Set(workingDays)];

    if (unique.length !== workingDays.length) {
      throw new InvalidWorkingDaysError(
        'Each weekday may be listed only once.',
        { workingDays },
      );
    }

    return this.sortWeekdays(unique);
  }

  private validateCutoff(dto: UpdateSettingsDto): void {
    if (
      !Number.isInteger(dto.cutoffWorkingDays) ||
      dto.cutoffWorkingDays < MIN_CUTOFF_WORKING_DAYS ||
      dto.cutoffWorkingDays > MAX_CUTOFF_WORKING_DAYS
    ) {
      throw new InvalidCutoffConfigurationError(
        `cutoffWorkingDays must be a whole number between ${MIN_CUTOFF_WORKING_DAYS} and ${MAX_CUTOFF_WORKING_DAYS}.`,
        { cutoffWorkingDays: dto.cutoffWorkingDays },
      );
    }

    // Throws if the time is not a real HH:mm value.
    this.kitchenTime.fromTimeString(dto.cutoffTime);
  }

  private sortWeekdays(workingDays: Weekday[]): Weekday[] {
    return [...workingDays].sort(
      (left, right) => WEEKDAYS.indexOf(left) - WEEKDAYS.indexOf(right),
    );
  }
}
