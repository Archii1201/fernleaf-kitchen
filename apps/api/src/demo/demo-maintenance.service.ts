import { Injectable, Logger } from '@nestjs/common';
import { seedDailyReviewData } from '../../prisma/seed-runtime.js';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DemoMaintenanceService {
  private readonly logger = new Logger(DemoMaintenanceService.name);
  constructor(private readonly prisma: PrismaService, private readonly kitchenTime: KitchenTime) {}

  async maintain(): Promise<{ created: string[] }> {
    const result = await seedDailyReviewData(this.prisma, {
      now: this.kitchenTime.now(), timeZone: this.kitchenTime.timeZone,
    });
    this.logger.log('Demo maintenance created ' + result.created.length + ' missing records');
    return result;
  }
}
