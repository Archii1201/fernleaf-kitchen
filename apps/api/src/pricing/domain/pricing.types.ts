/**
 * Plain shapes for the pricing domain. Like the combination validator, the
 * resolver deliberately does not speak Prisma: it is handed an in-memory
 * context and answers questions about it.
 */

export const PRICING_STRATEGIES = [
  'EXPLICIT',
  'COST_MULTIPLIER',
  'BASE_MARKUP',
] as const;

export type PricingStrategyKind = (typeof PRICING_STRATEGIES)[number];

export const PRICED_ITEM_TYPES = ['dish', 'option'] as const;
export type PricedItemType = (typeof PRICED_ITEM_TYPES)[number];

export interface PriceTierDefinition {
  id: string;
  code: string;
  name: string;
  strategy: PricingStrategyKind;
  /** 24000 = x2.4 for COST_MULTIPLIER; 1500 = +15% for BASE_MARKUP. */
  markupBasisPoints: number | null;
  baseTierId: string | null;
}

export interface PricedItem {
  id: string;
  type: PricedItemType;
  costCents: number;
}

/** An explicit (manually entered) price row for one item on one tier. */
export interface ExplicitPriceRow {
  tierId: string;
  itemType: PricedItemType;
  itemId: string;
  priceCents: number;
}

export type PriceSource = 'EXPLICIT' | 'DERIVED';

export type MissingPriceReason =
  /** The tier prices explicitly and nobody entered a price for this item. */
  | 'NO_EXPLICIT_PRICE'
  /** A derived tier whose base tier has no price for this item. */
  | 'MISSING_BASE_PRICE'
  /** The chain is longer than the domain allows; treated as unpriced. */
  | 'DERIVATION_TOO_DEEP';

export interface PricedResult {
  status: 'PRICED';
  /** Always a whole number of cents. */
  priceCents: number;
  source: PriceSource;
  /** Tier that actually produced the number (may be a base tier). */
  resolvedFromTierId: string;
}

/**
 * A missing price is a first-class outcome, never 0 and never null-as-zero:
 * a dish in this state must not appear in an employee menu, and an option in
 * this state is unavailable.
 */
export interface MissingPriceResult {
  status: 'MISSING';
  reason: MissingPriceReason;
  /** Tier at which the resolution gave up. */
  missingAtTierId: string;
}

export type PriceResolution = PricedResult | MissingPriceResult;

export function isPriced(result: PriceResolution): result is PricedResult {
  return result.status === 'PRICED';
}
