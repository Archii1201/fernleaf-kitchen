import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DateTime } from 'luxon';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { DemoMaintenanceService } from './demo-maintenance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { seedIfNeeded } from '../../prisma/seed.js';

@Injectable()
export class DemoScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DemoScheduler.name);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly maintenance: DemoMaintenanceService,
    private readonly kitchenTime: KitchenTime,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.VITEST || process.env.NODE_ENV === 'test') {
      return;
    }

    const result = await seedIfNeeded(this.prisma, {
      force: false, now: this.kitchenTime.now(), timeZone: this.kitchenTime.timeZone,
    });
    if (result.seeded) this.logger.log('Seeded empty database on startup');

    try {
      await this.maintenance.maintain();
    } catch (error) {
      this.logger.warn(
        `Startup demo maintenance failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.arm();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  private arm(): void {
    const now = DateTime.fromJSDate(this.kitchenTime.now(), {
      zone: this.kitchenTime.timeZone,
    });
    let next = now.set({ hour: 0, minute: 15, second: 0, millisecond: 0 });
    if (next <= now) {
      next = next.plus({ days: 1 });
    }

    this.timer = setTimeout(() => {
      void this.maintenance.maintain().catch((error: unknown) => {
        this.logger.warn(
          `00:15 demo maintenance failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      this.arm();
    }, next.diff(now).toMillis());
  }
}
