import { HttpStatus } from '@nestjs/common';
import { DomainError, type DomainErrorKind } from './domain-error.js';

/**
 * The only place where a domain failure is translated into an HTTP status.
 * The error classes themselves stay transport agnostic.
 */
export const DOMAIN_ERROR_STATUS: Record<DomainErrorKind, HttpStatus> = {
  validation: HttpStatus.BAD_REQUEST,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  forbidden: HttpStatus.FORBIDDEN,
};

export function statusForDomainError(error: DomainError): HttpStatus {
  return DOMAIN_ERROR_STATUS[error.kind];
}
