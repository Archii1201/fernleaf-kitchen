import {
  ConflictDomainError,
  ForbiddenDomainError,
  NotFoundDomainError,
} from '../common/errors/index.js';

export class DropNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({ code: 'DROP_NOT_FOUND', message: 'Drop not found.', details: { id } });
  }
}

export class DropConflictError extends ConflictDomainError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super({ code, message, details });
  }
}

export class DropDriverRequiredError extends ConflictDomainError {
  constructor(dropId: string) {
    super({
      code: 'DROP_DRIVER_REQUIRED',
      message: 'A driver must be assigned before the drop can leave the kitchen.',
      details: { dropId },
    });
  }
}

export class DropNotOwnedError extends ForbiddenDomainError {
  constructor(dropId: string) {
    super({
      code: 'DROP_NOT_OWNED',
      message: 'This drop is not assigned to the current driver.',
      details: { dropId },
    });
  }
}
