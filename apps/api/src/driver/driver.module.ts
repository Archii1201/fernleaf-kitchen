import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module.js';
import { FilesModule } from '../files/files.module.js';
import { DriverController } from './driver.controller.js';
import { DriverService } from './driver.service.js';

@Module({
  imports: [DispatchModule, FilesModule],
  controllers: [DriverController],
  providers: [DriverService],
})
export class DriverModule {}
