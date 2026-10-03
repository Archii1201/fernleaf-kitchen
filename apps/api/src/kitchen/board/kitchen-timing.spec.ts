import { describe, expect, it } from 'vitest';
import {
  AT_RISK_WINDOW_MINUTES,
  kitchenTimingState,
  plannedKitchenTimes,
} from './kitchen-timing.js';

describe('kitchen timing', () => {
  it('plans dispatch and kitchen-ready from delivery minus leave-kitchen minus 30', () => {
    const deliveryAt = new Date('2026-10-07T07:00:00.000Z');
    const planned = plannedKitchenTimes(deliveryAt, 60);

    expect(planned.dispatchReadyAt.toISOString()).toBe(
      '2026-10-07T06:00:00.000Z',
    );
    expect(planned.kitchenReadyAt.toISOString()).toBe(
      '2026-10-07T05:30:00.000Z',
    );
  });

  it('classifies ON_TRACK, AT_RISK and LATE', () => {
    const ready = new Date('2026-10-07T05:30:00.000Z');

    expect(
      kitchenTimingState(new Date('2026-10-07T04:00:00.000Z'), ready),
    ).toBe('ON_TRACK');
    expect(
      kitchenTimingState(
        new Date(ready.getTime() - (AT_RISK_WINDOW_MINUTES - 1) * 60_000),
        ready,
      ),
    ).toBe('AT_RISK');
    expect(
      kitchenTimingState(new Date('2026-10-07T05:31:00.000Z'), ready),
    ).toBe('LATE');
  });
});
