import {
  ConflictDomainError,
  NotFoundDomainError,
  ValidationDomainError,
} from '../common/errors/index.js';

export class InvoiceNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found.', details: { id } });
  }
}

export class OrderNotBillableError extends ConflictDomainError {
  constructor(orderId: string, reason: string) {
    super({
      code: 'ORDER_NOT_BILLABLE',
      message: reason,
      details: { orderId },
    });
  }
}

export class InvoiceConflictError extends ConflictDomainError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super({ code, message, details });
  }
}

export class CreditValidationError extends ValidationDomainError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super({ code, message, details });
  }
}
