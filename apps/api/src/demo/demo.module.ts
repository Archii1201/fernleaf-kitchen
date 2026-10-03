import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { DemoMaintenanceService } from './demo-maintenance.service.js';
import { DemoScheduler } from './demo-scheduler.js';

@Module({
  imports: [OrdersModule],
  providers: [DemoMaintenanceService, DemoScheduler],
  exports: [DemoMaintenanceService],
})
export class DemoModule {}
