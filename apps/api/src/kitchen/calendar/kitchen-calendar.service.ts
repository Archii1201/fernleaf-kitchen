import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { KitchenTime } from '../time/kitchen-time.js';
import type { Weekday } from '../time/weekday.js';

export interface KitchenCalendarSnapshot {
  workingDays: Weekday[];
  holidays: string[];
}

/**
 * The kitchen's own operating calendar: which weekdays it works and which
 * dates it is closed. Company working days are deliberately not consulted
 * here; they answer a different question (when a customer can receive).
 */
@Injectable()
export class KitchenCalendar {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenTime: KitchenTime,
  ) {}

  async getWorkingDays(): Promise<Weekday[]> {
    const rows = await this.prisma.kitchenWorkingDay.findMany({
      select: { weekday: true },
    });

    return rows.map((row) => row.weekday as Weekday);
  }

  async getHolidays(): Promise<string[]> {
    const rows = await this.prisma.kitchenHoliday.findMany({
      select: { date: true },
      orderBy: { date: 'asc' },
    });

    return rows.map((row) => this.kitchenTime.toDateString(row.date));
  }

  async snapshot(): Promise<KitchenCalendarSnapshot> {
    const [workingDays, holidays] = await Promise.all([
      this.getWorkingDays(),
      this.getHolidays(),
    ]);

    return { workingDays, holidays };
  }

  /** True when the kitchen operates on this date. */
  async isWorkingDay(date: string): Promise<boolean> {
    const weekday = this.kitchenTime.weekdayOf(date);
    const { workingDays, holidays } = await this.snapshot();

    return workingDays.includes(weekday) && !holidays.includes(date);
  }
}
