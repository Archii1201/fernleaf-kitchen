import {
  ConflictDomainError,
  NotFoundDomainError,
  ValidationDomainError,
} from '../common/errors/index.js';

export class CompanyNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'COMPANY_NOT_FOUND',
      message: 'Company not found.',
      details: { id },
    });
  }
}

export class CompanyAddressNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'ADDRESS_NOT_FOUND',
      message: 'Company address not found.',
      details: { id },
    });
  }
}

export class CompanyDomainNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'COMPANY_DOMAIN_NOT_FOUND',
      message: 'Company domain not found.',
      details: { id },
    });
  }
}

export class CompanyHolidayNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'COMPANY_HOLIDAY_NOT_FOUND',
      message: 'Company holiday not found.',
      details: { id },
    });
  }
}

export class DriverNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'DRIVER_NOT_FOUND',
      message: 'Driver not found.',
      details: { id },
    });
  }
}

/** The domain is already registered to a different company. */
export class CompanyDomainAlreadyUsedError extends ConflictDomainError {
  constructor(domain: string) {
    super({
      code: 'COMPANY_DOMAIN_ALREADY_USED',
      message: 'That email domain already belongs to another company.',
      details: { domain },
    });
  }
}

/** The same domain was supplied twice, or already exists on this company. */
export class DuplicateCompanyDomainError extends ConflictDomainError {
  constructor(domain: string) {
    super({
      code: 'DUPLICATE_COMPANY_DOMAIN',
      message: 'This company already has that email domain.',
      details: { domain },
    });
  }
}

export class CompanyAddressConflictError extends ConflictDomainError {
  constructor(label: string) {
    super({
      code: 'COMPANY_ADDRESS_CONFLICT',
      message: 'This company already has an address with that label.',
      details: { label },
    });
  }
}

export class DuplicateCompanyHolidayError extends ConflictDomainError {
  constructor(date: string) {
    super({
      code: 'DUPLICATE_COMPANY_HOLIDAY',
      message: 'This company already has a holiday on that date.',
      details: { date },
    });
  }
}

export class PackagingTypeNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'PACKAGING_TYPE_NOT_FOUND',
      message: 'Packaging type not found.',
      details: { id },
    });
  }
}

export class CompanyNameConflictError extends ConflictDomainError {
  constructor(name: string) {
    super({
      code: 'COMPANY_NAME_CONFLICT',
      message: 'Another company already uses that name.',
      details: { name },
    });
  }
}

/** The proposed owner is not an employee of this company. */
export class CompanyOwnerInvalidError extends ConflictDomainError {
  constructor(employeeId: string, companyId: string) {
    super({
      code: 'COMPANY_OWNER_INVALID',
      message:
        'The owner must be an active employee of this company. Create or move the employee first.',
      details: { employeeId, companyId },
    });
  }
}

export class PublicEmailDomainError extends ValidationDomainError {
  constructor(domain: string) {
    super({
      code: 'PUBLIC_EMAIL_DOMAIN',
      message:
        'Public email providers cannot identify a company. Use a domain the company owns.',
      details: { domain },
    });
  }
}

export class InvalidCompanyDomainError extends ValidationDomainError {
  constructor(domain: string) {
    super({
      code: 'INVALID_COMPANY_DOMAIN',
      message: 'That is not a valid email domain.',
      details: { domain },
    });
  }
}

export class InvalidWorkingDayError extends ValidationDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ code: 'INVALID_WORKING_DAY', message, details });
  }
}

export class InvalidDeliveryTimeError extends ValidationDomainError {
  constructor(value: string) {
    super({
      code: 'INVALID_DELIVERY_TIME',
      message: 'Delivery time must be a valid 24-hour HH:mm value.',
      details: { deliveryTime: value },
    });
  }
}

/** The staff member cannot be a default driver (inactive, or not allowed to
 * perform delivery work under the permission model). */
export class DriverNotEligibleError extends ValidationDomainError {
  constructor(staffId: string, reason: string) {
    super({
      code: 'DRIVER_NOT_ELIGIBLE',
      message: `That staff member cannot be set as the default driver: ${reason}`,
      details: { staffId },
    });
  }
}

export class CompanyAddressNotOwnedError extends ValidationDomainError {
  constructor(addressId: string, companyId: string) {
    super({
      code: 'COMPANY_ADDRESS_NOT_OWNED',
      message: 'That address belongs to a different company.',
      details: { addressId, companyId },
    });
  }
}

export class CompanyMustKeepOneDomainError extends ValidationDomainError {
  constructor() {
    super({
      code: 'COMPANY_MUST_KEEP_ONE_DOMAIN',
      message:
        'A company must keep at least one email domain. Add a replacement before removing this one.',
    });
  }
}

export class MenuReferenceNotFoundError extends ValidationDomainError {
  constructor(reference: 'menuCategory' | 'dish', ids: readonly string[]) {
    super({
      code: 'UNKNOWN_MENU_REFERENCE',
      message: `One or more ${reference} references do not exist.`,
      details: { reference, ids: [...ids] },
    });
  }
}
