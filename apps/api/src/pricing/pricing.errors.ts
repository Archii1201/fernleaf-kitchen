import {
  ConflictDomainError,
  NotFoundDomainError,
  ValidationDomainError,
} from '../common/errors/index.js';

/** Raised by the Money value object when integer-cent invariants are broken. */
export class MoneyError extends ValidationDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ code: 'INVALID_MONEY', message, details });
  }
}

export class PriceTierNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'PRICE_TIER_NOT_FOUND',
      message: 'Price tier not found.',
      details: { id },
    });
  }
}

export class DefaultPriceTierMissingError extends NotFoundDomainError {
  constructor() {
    super({
      code: 'DEFAULT_PRICE_TIER_MISSING',
      message:
        'No default price tier is configured. Seed or mark one tier as default before pricing anything.',
    });
  }
}

export class PriceTierNameConflictError extends ConflictDomainError {
  constructor(field: 'code' | 'name', value: string) {
    super({
      code: 'PRICE_TIER_ALREADY_EXISTS',
      message: `Another price tier already uses this ${field}.`,
      details: { field, value },
    });
  }
}

/** The default tier anchors every other tier, so it cannot be removed. */
export class DefaultPriceTierProtectedError extends ValidationDomainError {
  constructor(action: string) {
    super({
      code: 'DEFAULT_PRICE_TIER_PROTECTED',
      message: `The default price tier cannot be ${action}. Make another tier the default first.`,
    });
  }
}

export class InvalidPricingStrategyError extends ValidationDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ code: 'INVALID_PRICING_STRATEGY', message, details });
  }
}

export class TierSelfReferenceError extends ValidationDomainError {
  constructor(tierId: string) {
    super({
      code: 'TIER_SELF_REFERENCE',
      message: 'A price tier cannot derive from itself.',
      details: { tierId },
    });
  }
}

export class TierCycleError extends ValidationDomainError {
  constructor(chain: readonly string[]) {
    super({
      code: 'TIER_DERIVATION_CYCLE',
      message:
        'That base tier would create a derivation cycle. Pick a tier that does not already derive from this one.',
      details: { chain: [...chain] },
    });
  }
}

export class TierDepthExceededError extends ValidationDomainError {
  constructor(maxDepth: number, chain: readonly string[]) {
    super({
      code: 'TIER_DERIVATION_TOO_DEEP',
      message: `A price tier may derive through at most ${maxDepth} other tiers.`,
      details: { maxDepth, chain: [...chain] },
    });
  }
}

export class BaseTierNotFoundError extends ValidationDomainError {
  constructor(baseTierId: string) {
    super({
      code: 'BASE_TIER_NOT_FOUND',
      message: 'The base tier this tier derives from does not exist.',
      details: { baseTierId },
    });
  }
}

export class PricedItemNotFoundError extends ValidationDomainError {
  constructor(itemType: string, ids: readonly string[]) {
    super({
      code: 'PRICED_ITEM_NOT_FOUND',
      message: `One or more ${itemType} references in this price update do not exist.`,
      details: { itemType, ids: [...ids] },
    });
  }
}

export class DuplicatePriceEntryError extends ValidationDomainError {
  constructor(itemType: string, itemId: string) {
    super({
      code: 'DUPLICATE_PRICE_ENTRY',
      message: 'The same item appears twice in this price update.',
      details: { itemType, itemId },
    });
  }
}
