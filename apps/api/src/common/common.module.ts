import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './interceptors/logging.interceptor.js';

/**
 * Cross-cutting HTTP infrastructure shared by every feature module.
 *
 * Registered as providers (instead of `app.useGlobalFilters`) so the filter and
 * interceptor participate in dependency injection.
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class CommonModule {}
