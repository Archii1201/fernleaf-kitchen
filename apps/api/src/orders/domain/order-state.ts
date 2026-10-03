import { InvalidOrderTransitionError } from '../orders.errors.js';

export const ORDER_STATUSES = [
  'DRAFT',
  'PLACED',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'IN_KITCHEN',
  'READY',
  'DISPATCH_READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
/**
 * Order lifecycle and operational workflow.
 *
 * DRAFT
 *   → PLACED
 *   → CONFIRMED
 *   → IN_KITCHEN
 *   → READY
 *   → DISPATCH_READY
 *   → OUT_FOR_DELIVERY
 *   → DELIVERED
 *
 * Exceptional terminal transitions:
 *   DRAFT  → CANCELLED
 *   PLACED → CANCELLED | REJECTED
 *
 * Kitchen and dispatch services own the operations that cause
 * the corresponding workflow transitions.
 */
const ALLOWED: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT: ['PLACED', 'CANCELLED'],

  PLACED: ['CONFIRMED', 'CANCELLED', 'REJECTED'],

  CONFIRMED: ['IN_KITCHEN'],

  IN_KITCHEN: ['READY'],

  READY: ['DISPATCH_READY'],

  DISPATCH_READY: ['OUT_FOR_DELIVERY'],

  OUT_FOR_DELIVERY: ['DELIVERED'],

  REJECTED: [],

  CANCELLED: [],

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
