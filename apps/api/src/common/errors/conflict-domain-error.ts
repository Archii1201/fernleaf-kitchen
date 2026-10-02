import { DomainError, type DomainErrorOptions } from './domain-error.js';

/** The operation conflicts with the current state (duplicates, locked state). */
export class ConflictDomainError extends DomainError {
  readonly kind = 'conflict' as const;

  constructor(options: DomainErrorOptions) {
    super(options);
  }
}
