import { describe, expect, it } from 'vitest';
import {
  InvalidCompanyDomainError,
  PublicEmailDomainError,
} from '../companies.errors.js';
import {
  domainOfEmail,
  normalizeCompanyDomain,
  normalizeEmail,
  normalizeEmailDomain,
  PUBLIC_EMAIL_DOMAINS,
} from './email-domain.js';

describe('email domain normalization', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmailDomain('  Northwind.COM ')).toBe('northwind.com');
  });

  it('drops an accidental leading @', () => {
    expect(normalizeEmailDomain('@northwind.com')).toBe('northwind.com');
  });

  it('drops a pasted local part', () => {
    expect(normalizeEmailDomain('alice@northwind.com')).toBe('northwind.com');
  });

  it('accepts subdomains', () => {
    expect(normalizeEmailDomain('mail.northwind.co.uk')).toBe(
      'mail.northwind.co.uk',
    );
  });

  it('rejects values that are not domains', () => {
    for (const value of ['northwind', 'north wind.com', 'http://x.com', '']) {
      expect(() => normalizeEmailDomain(value)).toThrow(
        InvalidCompanyDomainError,
      );
    }
  });
});

describe('public email domains', () => {
  it('rejects consumer mailbox providers', () => {
    for (const domain of ['gmail.com', 'Yahoo.com', '@outlook.com']) {
      expect(() => normalizeCompanyDomain(domain)).toThrow(
        PublicEmailDomainError,
      );
    }
  });

  it('accepts a company-owned domain', () => {
    expect(normalizeCompanyDomain('Northwind.com')).toBe('northwind.com');
  });

  it('keeps the blocked list centralized and extensible', () => {
    expect(PUBLIC_EMAIL_DOMAINS.has('protonmail.com')).toBe(true);
    expect(PUBLIC_EMAIL_DOMAINS.has('northwind.com')).toBe(false);
  });
});

describe('employee email helpers', () => {
  it('normalizes an email', () => {
    expect(normalizeEmail('  Alice@Northwind.com ')).toBe(
      'alice@northwind.com',
    );
  });

  it('extracts the domain', () => {
    expect(domainOfEmail('Alice@Northwind.com')).toBe('northwind.com');
  });

  it('rejects a malformed address', () => {
    expect(() => domainOfEmail('alice')).toThrow(InvalidCompanyDomainError);
    expect(() => domainOfEmail('@northwind.com')).toThrow(
      InvalidCompanyDomainError,
    );
  });
});
