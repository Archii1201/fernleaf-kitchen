/**
 * Transport-agnostic classification of a domain failure.
 *
 * The domain layer never references HTTP status codes; the global exception
 * filter is the only place that maps these kinds onto a transport.
 */
export type DomainErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'forbidden';

export interface DomainErrorOptions {
  /** Machine-readable code returned to clients, e.g. `PREP_UNIT_LOCKED`. */
  code: string;
  /** Human-readable message that is safe to return to clients. */
  message: string;
  /** Optional non-sensitive context (field names, identifiers). */
  details?: Record<string, unknown>;
  cause?: unknown;
}

export abstract class DomainError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  abstract readonly kind: DomainErrorKind;

  protected constructor(options: DomainErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
  }
}
