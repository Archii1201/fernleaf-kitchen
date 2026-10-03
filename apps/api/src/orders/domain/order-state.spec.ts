import { describe, expect, it } from 'vitest';
import { InvalidOrderTransitionError } from '../orders.errors.js';
import { assertTransition, canTransition } from './order-state.js';

describe('order state machine', () => {
  it('allows the primary and alternative transitions', () => {
    expect(canTransition('DRAFT', 'PLACED')).toBe(true);
    expect(canTransition('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransition('PLACED', 'CONFIRMED')).toBe(true);
    expect(canTransition('PLACED', 'CANCELLED')).toBe(true);
    expect(canTransition('PLACED', 'REJECTED')).toBe(true);
    expect(canTransition('CONFIRMED', 'DELIVERED')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('DRAFT', 'CONFIRMED')).toBe(false);
    expect(canTransition('DRAFT', 'DELIVERED')).toBe(false);
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false);
    expect(canTransition('CANCELLED', 'PLACED')).toBe(false);
    expect(canTransition('CONFIRMED', 'REJECTED')).toBe(false);
    expect(() => assertTransition('DRAFT', 'DELIVERED')).toThrow(
      InvalidOrderTransitionError,
    );
  });
});
