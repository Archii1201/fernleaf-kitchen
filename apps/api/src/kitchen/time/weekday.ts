/**
 * Weekday names, matching the Prisma `Weekday` enum but declared locally so
 * the time/cutoff domain does not depend on the database client.
 */
export const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export function isWeekday(value: unknown): value is Weekday {
  return (
    typeof value === 'string' && (WEEKDAYS as readonly string[]).includes(value)
  );
}

/** Luxon numbers weekdays 1 (Monday) to 7 (Sunday). */
export function weekdayFromLuxon(luxonWeekday: number): Weekday {
  return WEEKDAYS[luxonWeekday - 1];
}
