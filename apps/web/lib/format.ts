const ZONE = 'Asia/Kolkata';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

/** Display only: the API always speaks integer cents (paise). */
export function rupees(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? '—' : inr.format(cents / 100);
}

/** Parses a typed rupee amount into integer cents; `undefined` when invalid. */
export function rupeesToCents(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return undefined;
  }
  const [whole, fraction = ''] = trimmed.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export const centsToRupeesInput = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? '' : (cents / 100).toFixed(2);

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** `YYYY-MM-DD` (a kitchen calendar date) to a readable label. */
export function formatDate(date: string | null | undefined): string {
  if (!date) {
    return '—';
  }
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** ISO instant to kitchen-local date and time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: ZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** ISO instant to kitchen-local `HH:mm`. */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export const humanize = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ');

export function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', hour12: false }).format(new Date()),
  );
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}
