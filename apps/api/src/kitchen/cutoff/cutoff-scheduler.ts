import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DateTime } from 'luxon';
import { KitchenTime } from '../time/kitchen-time.js';
import { CutoffProcessingService } from './cutoff-processing.service.js';

const INTERVAL_MS = 3 * 60 * 1000;
const LOOKAHEAD_DAYS = 3;

/**
 * Startup + interval trigger. Both call ensureProcessed — no cutoff math here.
 */
@Injectable()
export class CutoffScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CutoffScheduler.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly processing: CutoffProcessingService,
    private readonly kitchenTime: KitchenTime,
  ) {}

  onModuleInit(): void {
    if (process.env.VITEST || process.env.NODE_ENV === 'test') {
      return;
    }

    void this.tick('startup');
    this.timer = setInterval(() => {
      void this.tick('schedule');
    }, INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async tick(source: string): Promise<void> {
    const today = this.kitchenTime.today();

    for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset += 1) {
      const date = DateTime.fromISO(today, { zone: this.kitchenTime.timeZone })
        .plus({ days: offset })
        .toISODate();

      if (!date) {
        continue;
      }

      try {
        await this.processing.ensureProcessed(date);
      } catch (error) {
        this.logger.warn(
          `Cutoff ${source} failed for ${date}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
