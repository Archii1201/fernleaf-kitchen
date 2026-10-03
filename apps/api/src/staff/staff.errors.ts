import {
  ConflictDomainError,
  ForbiddenDomainError,
  NotFoundDomainError,
  ValidationDomainError,
} from '../common/errors/index.js';

export class StaffNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'STAFF_NOT_FOUND',
      message: 'Staff member not found.',
      details: { id },
    });
  }
}

export class StaffProfileNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'STAFF_PROFILE_NOT_FOUND',
      message: 'This staff account has no profile to update.',
      details: { id },
    });
  }
}

export class StaffEmailConflictError extends ConflictDomainError {
  constructor(email: string) {
    super({
      code: 'STAFF_EMAIL_ALREADY_EXISTS',
      message: 'A staff account with this email already exists.',
      details: { email },
    });
  }
}

export class StaffCodeConflictError extends ConflictDomainError {
  constructor() {
    super({
      code: 'STAFF_CODE_ALREADY_EXISTS',
      message: 'A staff member with this staff code already exists.',
    });
  }
}

export class InvalidRoleError extends ValidationDomainError {
  constructor(roleId: string) {
    super({
      code: 'ROLE_NOT_FOUND',
      message: 'The requested role does not exist.',
      details: { roleId },
    });
  }
}

/** An admin must not be able to lock themselves out of the system. */
export class SelfDeactivationForbiddenError extends ForbiddenDomainError {
  constructor() {
    super({
      code: 'SELF_DEACTIVATION_FORBIDDEN',
      message: 'You cannot deactivate your own account.',
    });
  }
}

/** An admin must not be able to drop their own staff-management capability. */
export class SelfRoleDowngradeForbiddenError extends ForbiddenDomainError {
  constructor() {
    super({
      code: 'SELF_ROLE_DOWNGRADE_FORBIDDEN',
      message:
        'You cannot move yourself to a role that cannot manage staff accounts.',
    });
  }
}
