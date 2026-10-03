export function isOnTime(
  deliveredAt: Date,
  deliveryAt: Date,
  graceMinutes: number,
): boolean {
  return deliveredAt.getTime() <= deliveryAt.getTime() + graceMinutes * 60_000;
}
