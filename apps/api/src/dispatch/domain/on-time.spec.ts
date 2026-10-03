import { describe, expect, it } from 'vitest';
import { isOnTime } from './on-time.js';

describe('isOnTime', () => {
  const deliveryAt = new Date('2026-10-04T07:00:00.000Z');

  it('is true at the promised time and within the grace window', () => {
    expect(isOnTime(deliveryAt, deliveryAt, 15)).toBe(true);
    expect(isOnTime(new Date(deliveryAt.getTime() + 15 * 60_000), deliveryAt, 15)).toBe(true);
  });

  it('is false after the grace window', () => {
    expect(isOnTime(new Date(deliveryAt.getTime() + 15 * 60_000 + 1), deliveryAt, 15)).toBe(false);
  });
});
