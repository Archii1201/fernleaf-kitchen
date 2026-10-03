import {
  ForbiddenDomainError,
  UnauthorizedDomainError,
} from '../common/errors/index.js';

/**
 * Deliberately identical for an unknown email, a wrong password and a
 * deactivated account: a different message for each would let an attacker
 * enumerate valid staff accounts.
 */
export class InvalidCredentialsError extends UnauthorizedDomainError {
  constructor() {
    super({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
  }
}

/** No token was presented on a protected route. */
export class MissingAuthenticationError extends UnauthorizedDomainError {
  constructor() {
    super({
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required.',
    });
  }
}

/** A token was presented but is expired, malformed, or no longer usable. */
export class InvalidTokenError extends UnauthorizedDomainError {
  constructor() {
    super({
      code: 'INVALID_TOKEN',
      message: 'Your session is invalid or has expired.',
    });
  }
}

/** Authenticated, but the role does not grant the required permissions. */
export class InsufficientPermissionsError extends ForbiddenDomainError {
  constructor(requiredPermissions: readonly string[]) {
    super({
      code: 'INSUFFICIENT_PERMISSIONS',
      message: 'You do not have permission to perform this action.',
      details: { requiredPermissions: [...requiredPermissions] },
    });
  }
}
