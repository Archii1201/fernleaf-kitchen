import { DomainError, type DomainErrorOptions } from './domain-error.js';

/** The caller is known but not allowed to perform the operation. */
export class ForbiddenDomainError extends DomainError {
  readonly kind = 'forbidden' as const;

  constructor(options: DomainErrorOptions) {
    super(options);
  }
}
