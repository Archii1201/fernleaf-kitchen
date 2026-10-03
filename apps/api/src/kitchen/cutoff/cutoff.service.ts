import { Injectable } from '@nestjs/common';
import { KitchenCalendar } from '../calendar/kitchen-calendar.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { KitchenTime } from '../time/kitchen-time.js';
import { calculateCutoff, type CutoffResult } from './cutoff-calculator.js';

export interface ResolvedCutoff extends CutoffResult {
  cutoffTime: string;
  cutoffWorkingDays: number;
  timeZone: string;
  evaluatedAt: Date;
  hasPassed: boolean;
}

/**
 * Wires the pure calculator to the stored settings, the kitchen calendar and
 * the injected clock. Any future cutoff-sensitive operation (order placement,
 * cutoff runs) asks this service and compares `cutoffAt` with `evaluatedAt`.
 */
@Injectable()
export class CutoffService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly kitchenCalendar: KitchenCalendar,
    private readonly kitchenTime: KitchenTime,
  ) {}

  async resolve(deliveryDate: string): Promise<ResolvedCutoff> {
    this.kitchenTime.assertDateString(deliveryDate);

    const [config, calendar] = await Promise.all([
      this.settingsService.getCutoffConfig(),
      this.kitchenCalendar.snapshot(),
    ]);

    const result = calculateCutoff({
      deliveryDate,
      cutoffWorkingDays: config.cutoffWorkingDays,
      cutoffTime: config.cutoffTime,
      kitchenWorkingDays: calendar.workingDays,
      kitchenHolidays: calendar.holidays,
      timeZone: this.kitchenTime.timeZone,
    });

    return {
      ...result,
      cutoffTime: config.cutoffTime,
      cutoffWorkingDays: config.cutoffWorkingDays,
      timeZone: this.kitchenTime.timeZone,
      evaluatedAt: this.kitchenTime.now(),
      hasPassed: this.kitchenTime.hasPassed(result.cutoffAt),
    };
  }
}
