import { Global, Module } from '@nestjs/common';
import { KitchenBoardController } from './board/kitchen-board.controller.js';
import { KitchenBoardService } from './board/kitchen-board.service.js';
import { KitchenCalendar } from './calendar/kitchen-calendar.service.js';
import { CutoffProcessingController } from './cutoff/cutoff-processing.controller.js';
import { CutoffProcessingService } from './cutoff/cutoff-processing.service.js';
import { CutoffScheduler } from './cutoff/cutoff-scheduler.js';
import { CutoffService } from './cutoff/cutoff.service.js';
import { SettingsController } from './settings/settings.controller.js';
import { SettingsService } from './settings/settings.service.js';
import { CLOCK, SystemClock } from './time/clock.js';
import { KitchenTime } from './time/kitchen-time.js';

/**
 * Time, calendar, cutoff and settings. Global because every later domain
 * (orders, kitchen, dispatch, billing) needs the clock and `KitchenTime`, and
 * re-importing this module everywhere would be noise.
 */
@Global()
@Module({
  controllers: [
    SettingsController,
    CutoffProcessingController,
    KitchenBoardController,
  ],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    KitchenTime,
    KitchenCalendar,
    SettingsService,
    CutoffService,
    CutoffProcessingService,
    CutoffScheduler,
    KitchenBoardService,
  ],
  exports: [
    CLOCK,
    KitchenTime,
    KitchenCalendar,
    SettingsService,
    CutoffService,
    CutoffProcessingService,
    KitchenBoardService,
  ],
})
export class KitchenModule {}
