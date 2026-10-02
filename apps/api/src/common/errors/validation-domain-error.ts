import { DomainError, type DomainErrorOptions } from './domain-error.js';

/** The request is well-formed but violates a business invariant. */
export class ValidationDomainError extends DomainError {
  readonly kind = 'validation' as const;

  constructor(options: DomainErrorOptions) {
    super(options);
  }
}
