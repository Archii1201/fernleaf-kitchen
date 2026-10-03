import {
  ConflictDomainError,
  NotFoundDomainError,
  ValidationDomainError,
} from '../common/errors/index.js';

export class InvalidDateStringError extends ValidationDomainError {
  constructor(value: string) {
    super({
      code: 'INVALID_DATE',
      message: 'Dates must be real calendar dates in YYYY-MM-DD format.',
      details: { value },
    });
  }
}

export class InvalidTimeStringError extends ValidationDomainError {
  constructor(value: string) {
    super({
      code: 'INVALID_TIME',
      message: 'Times must be in HH:mm (24 hour) format.',
      details: { value },
    });
  }
}

export class InvalidWorkingDaysError extends ValidationDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ code: 'INVALID_WORKING_DAYS', message, details });
  }
}

export class InvalidCutoffConfigurationError extends ValidationDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ code: 'INVALID_CUTOFF_CONFIGURATION', message, details });
  }
}

/** No kitchen working day exists within the lookback window. */
export class UnresolvableCutoffError extends ValidationDomainError {
  constructor(deliveryDate: string) {
    super({
      code: 'CUTOFF_UNRESOLVABLE',
      message:
        'The cutoff cannot be resolved: the kitchen has no working days before this delivery date.',
      details: { deliveryDate },
    });
  }
}

export class SettingsNotInitializedError extends NotFoundDomainError {
  constructor() {
    super({
      code: 'SETTINGS_NOT_INITIALIZED',
      message:
        'Kitchen settings have not been configured yet. Seed the defaults or submit PUT /api/settings.',
    });
  }
}

export class HolidayNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'KITCHEN_HOLIDAY_NOT_FOUND',
      message: 'Kitchen holiday not found.',
      details: { id },
    });
  }
}

export class DuplicateHolidayError extends ConflictDomainError {
  constructor(date: string) {
    super({
      code: 'KITCHEN_HOLIDAY_ALREADY_EXISTS',
      message: 'This date is already a kitchen holiday.',
      details: { date },
    });
  }
}
