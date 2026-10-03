import { DomainError, type DomainErrorOptions } from './domain-error.js';

/** The caller is not authenticated, or the credentials presented are invalid. */
export class UnauthorizedDomainError extends DomainError {
  readonly kind = 'unauthorized' as const;

  constructor(options: DomainErrorOptions) {
    super(options);
  }
}
