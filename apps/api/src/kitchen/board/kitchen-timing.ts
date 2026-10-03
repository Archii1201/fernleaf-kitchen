/** Fixed kitchen-prep interval. Distinct from Company.leaveKitchenMinutes. */
export const KITCHEN_PREP_MINUTES = 30;
export const AT_RISK_WINDOW_MINUTES = 15;

export type KitchenTimingState = 'LATE' | 'AT_RISK' | 'ON_TRACK';

export function plannedKitchenTimes(
  deliveryAt: Date,
  leaveKitchenMinutes: number,
): { dispatchReadyAt: Date; kitchenReadyAt: Date } {
  const dispatchReadyAt = new Date(
    deliveryAt.getTime() - leaveKitchenMinutes * 60_000,
  );
  const kitchenReadyAt = new Date(
    dispatchReadyAt.getTime() - KITCHEN_PREP_MINUTES * 60_000,
  );

  return { dispatchReadyAt, kitchenReadyAt };
}

export function kitchenTimingState(
  now: Date,
  kitchenReadyAt: Date,
  _allUnitsDone = false,
): KitchenTimingState {
  if (now.getTime() > kitchenReadyAt.getTime()) {
    return 'LATE';
  }

  if (
    now.getTime() >
    kitchenReadyAt.getTime() - AT_RISK_WINDOW_MINUTES * 60_000
  ) {
    return 'AT_RISK';
  }

  return 'ON_TRACK';
}
