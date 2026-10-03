import {
  ConflictDomainError,
  NotFoundDomainError,
  ValidationDomainError,
} from '../common/errors/index.js';
import type { OrderStatus } from './domain/order-state.js';

export class OrderNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'ORDER_NOT_FOUND',
      message: 'Order not found.',
      details: { id },
    });
  }
}

export class InvalidOrderTransitionError extends ConflictDomainError {
  constructor(from: OrderStatus, to: OrderStatus) {
    super({
      code: 'INVALID_ORDER_TRANSITION',
      message: `An order cannot move from ${from} to ${to}.`,
      details: { from, to },
    });
  }
}

export class OrderCutoffPassedError extends ConflictDomainError {
  constructor(deliveryDate: string, cutoffAt: Date) {
    super({
      code: 'ORDER_CUTOFF_PASSED',
      message: 'The kitchen cutoff for that delivery date has passed.',
      details: { deliveryDate, cutoffAt: cutoffAt.toISOString() },
    });
  }
}

export class OrderVersionConflictError extends ConflictDomainError {
  constructor(expected: number, actual: number) {
    super({
      code: 'ORDER_VERSION_CONFLICT',
      message: 'This order changed since you loaded it. Reload and try again.',
      details: { expected, actual },
    });
  }
}

export class PrepUnitLockedError extends ConflictDomainError {
  constructor(signature: string, status: string) {
    super({
      code: 'PREP_UNIT_LOCKED',
      message:
        'Kitchen work has already started on that combination. It cannot be changed.',
      details: { signature, status },
    });
  }
}

export class InvalidDeliveryDateError extends ValidationDomainError {
  constructor(deliveryDate: string, reason: string) {
    super({
      code: 'INVALID_DELIVERY_DATE',
      message: reason,
      details: { deliveryDate },
    });
  }
}

export class DeliveryNotAllowedError extends ValidationDomainError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super({
      code: 'DELIVERY_NOT_ALLOWED',
      message,
      details,
    });
  }
}

export class PriceNotAvailableError extends ValidationDomainError {
  constructor(itemType: 'dish' | 'option', itemId: string) {
    super({
      code: 'PRICE_NOT_AVAILABLE',
      message:
        'A selected item has no price on this company tier and cannot be ordered.',
      details: { itemType, itemId },
    });
  }
}

export class OrderNotEditableError extends ConflictDomainError {
  constructor(status: string) {
    super({
      code: 'ORDER_NOT_EDITABLE',
      message: 'This order cannot be edited in its current state.',
      details: { status },
    });
  }
}

export class InactiveEmployeeError extends ValidationDomainError {
  constructor(employeeId: string) {
    super({
      code: 'EMPLOYEE_INACTIVE',
      message: 'That employee is inactive and cannot place orders.',
      details: { employeeId },
    });
  }
}

export class InactiveCompanyError extends ValidationDomainError {
  constructor(companyId: string) {
    super({
      code: 'COMPANY_INACTIVE',
      message: 'That company is inactive and cannot receive orders.',
      details: { companyId },
    });
  }
}
