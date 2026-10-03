import {
  InvalidCompanyDomainError,
  PublicEmailDomainError,
} from '../companies.errors.js';

/**
 * Consumer mailbox providers. A company is identified by the domain its staff
 * mail from, so accepting one of these would let anyone with a free mailbox
 * sign up as that company's employee.
 *
 * Kept here, centralized and exported, so it can later be moved into
 * configuration or a database table without touching any caller.
 */
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'aol.com',
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'mail.com',
  'me.com',
  'msn.com',
  'outlook.com',
  'proton.me',
  'protonmail.com',
  'yahoo.com',
  'yandex.com',
  'zoho.com',
]);

/**
 * A hostname with at least one dot and a 2+ character TLD. Deliberately
 * stricter than an email regex: this is a domain, not an address.
 */
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * Lowercases, trims, and drops an accidental leading `@` or a pasted
 * `user@` prefix, then validates the result.
 *
 * Every comparison in the system - uniqueness checks, employee email
 * matching - runs on the normalized form, so `@Acme.COM ` and `acme.com` can
 * never end up as two different rows.
 */
export function normalizeEmailDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const withoutLocalPart = trimmed.includes('@')
    ? trimmed.slice(trimmed.lastIndexOf('@') + 1)
    : trimmed;
  const domain = withoutLocalPart.replace(/\.$/, '');

  if (!DOMAIN_PATTERN.test(domain)) {
    throw new InvalidCompanyDomainError(raw);
  }

  return domain;
}

export function assertNotPublicDomain(domain: string): void {
  if (PUBLIC_EMAIL_DOMAINS.has(domain)) {
    throw new PublicEmailDomainError(domain);
  }
}

/** Normalizes and rejects public providers in one step. */
export function normalizeCompanyDomain(raw: string): string {
  const domain = normalizeEmailDomain(raw);

  assertNotPublicDomain(domain);

  return domain;
}

/** Lowercased, trimmed email. Local parts are case-sensitive in theory and
 * case-insensitive at every real provider; we normalize so uniqueness works. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function domainOfEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');

  if (at < 1 || at === normalized.length - 1) {
    throw new InvalidCompanyDomainError(email);
  }

  return normalized.slice(at + 1);
}
