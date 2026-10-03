import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';
import { DriverEligibilityService } from './domain/driver-eligibility.service.js';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, DriverEligibilityService],
  // EmployeesModule reuses the company lookup and the approved-domain list.
  exports: [CompaniesService],
})
export class CompaniesModule {}
