import { DefaultPriceTierMissingError } from '../pricing.errors.js';

/**
 * Which tier prices an order or a menu: the company's own tier when it has
 * one, otherwise the system default.
 *
 * Kept as a pure function so the rule is testable without a database and so
 * the future Menu and Orders modules apply exactly the same precedence.
 */
export function selectEffectiveTierId(
  companyTierId: string | null | undefined,
  defaultTierId: string | null | undefined,
): string {
  if (companyTierId) {
    return companyTierId;
  }

  if (!defaultTierId) {
    throw new DefaultPriceTierMissingError();
  }

  return defaultTierId;
}
