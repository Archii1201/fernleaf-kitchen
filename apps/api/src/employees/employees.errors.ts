import {
  ConflictDomainError,
  NotFoundDomainError,
  ValidationDomainError,
} from '../common/errors/index.js';

export class EmployeeNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'EMPLOYEE_NOT_FOUND',
      message: 'Employee not found.',
      details: { id },
    });
  }
}

export class EmployeeEmailConflictError extends ConflictDomainError {
  constructor(email: string) {
    super({
      code: 'EMPLOYEE_EMAIL_CONFLICT',
      message: 'Another employee already uses that email address.',
      details: { email },
    });
  }
}

/**
 * The address the employee's email sits on is not one of their company's
 * approved domains. This is what ties a person to a company.
 */
export class EmployeeDomainMismatchError extends ValidationDomainError {
  constructor(email: string, allowedDomains: readonly string[]) {
    super({
      code: 'EMPLOYEE_DOMAIN_NOT_APPROVED',
      message:
        "That email is not on one of the company's approved domains. Add the domain to the company first.",
      details: { email, allowedDomains: [...allowedDomains] },
    });
  }
}

/** The employee owns their current company, so they cannot leave it. */
export class EmployeeOwnsCompanyError extends ConflictDomainError {
  constructor(employeeId: string, companyId: string) {
    super({
      code: 'EMPLOYEE_OWNS_COMPANY',
      message:
        'This employee owns their current company. Assign a new owner before moving or deactivating them.',
      details: { employeeId, companyId },
    });
  }
}

export class UnknownEmployeeReferenceError extends ValidationDomainError {
  constructor(reference: 'allergen' | 'dietaryTag', ids: readonly string[]) {
    super({
      code: 'UNKNOWN_REFERENCE',
      message: `One or more ${reference} references do not exist.`,
      details: { reference, ids: [...ids] },
    });
  }
}
