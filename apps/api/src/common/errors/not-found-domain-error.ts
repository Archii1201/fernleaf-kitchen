import { DomainError, type DomainErrorOptions } from './domain-error.js';

/** The requested aggregate/entity does not exist. */
export class NotFoundDomainError extends DomainError {
  readonly kind = 'not_found' as const;

  constructor(options: DomainErrorOptions) {
    super(options);
  }
}
