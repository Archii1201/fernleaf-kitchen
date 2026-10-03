import { InvalidOrderTransitionError } from '../orders.errors.js';

export const ORDER_STATUSES = [
  'DRAFT',
  'PLACED',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'IN_KITCHEN',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Allowed transitions for this step. Kitchen/dispatch statuses exist on the
 * model but are not entered here — those steps own their own machines.
 *
 *   DRAFT     → PLACED | CANCELLED
 *   PLACED    → CONFIRMED | CANCELLED | REJECTED
 *   CONFIRMED → DELIVERED
 */
const ALLOWED: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT: ['PLACED', 'CANCELLED'],
  PLACED: ['CONFIRMED', 'CANCELLED', 'REJECTED'],
  CONFIRMED: ['DELIVERED'],
  REJECTED: [],
  CANCELLED: [],
  IN_KITCHEN: [],
  READY: [],
  OUT_FOR_DELIVERY: [],
  DELIVERED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}

export function isEditableStatus(status: OrderStatus): boolean {
  return status === 'DRAFT' || status === 'PLACED';
}

export function allowsLineDiff(status: OrderStatus): boolean {
  return status === 'DRAFT' || status === 'PLACED' || status === 'CONFIRMED';
}
