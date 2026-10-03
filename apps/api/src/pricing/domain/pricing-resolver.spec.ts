import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DefaultPriceTierMissingError,
  TierCycleError,
  TierDepthExceededError,
  TierSelfReferenceError,
} from '../pricing.errors.js';
import { PricingContext } from './pricing-context.js';
import { PricingResolver } from './pricing-resolver.js';
import {
  isPriced,
  type ExplicitPriceRow,
  type PriceTierDefinition,
  type PricedItem,
} from './pricing.types.js';
import { BaseTierPercentageStrategy } from './strategies/base-tier-percentage.strategy.js';
import { CostMultiplierStrategy } from './strategies/cost-multiplier.strategy.js';
import { ExplicitPriceStrategy } from './strategies/explicit-price.strategy.js';
import { MAX_TIER_DERIVATION_DEPTH, validateTierChain } from './tier-chain.js';
import { selectEffectiveTierId } from './tier-selection.js';

const STANDARD: PriceTierDefinition = {
  id: 'tier-standard',
  code: 'STANDARD',
  name: 'Standard',
  strategy: 'EXPLICIT',
  markupBasisPoints: null,
  baseTierId: null,
};

const ENTERPRISE: PriceTierDefinition = {
  id: 'tier-enterprise',
  code: 'ENTERPRISE',
  name: 'Enterprise',
  strategy: 'COST_MULTIPLIER',
  // 24000 bp = cost x 2.4
  markupBasisPoints: 24_000,
  baseTierId: null,
};

const PARTNER: PriceTierDefinition = {
  id: 'tier-partner',
  code: 'PARTNER',
  name: 'Partner',
  strategy: 'BASE_MARKUP',
  // 1500 bp = Standard + 15%
  markupBasisPoints: 1_500,
  baseTierId: STANDARD.id,
};

const TIERS = [STANDARD, ENTERPRISE, PARTNER];

const CURRY: PricedItem = { id: 'dish-curry', type: 'dish', costCents: 88 };
const WRAP: PricedItem = { id: 'dish-wrap', type: 'dish', costCents: 400 };
const PANEER: PricedItem = {
  id: 'opt-paneer',
  type: 'option',
  costCents: 100,
};

function contextFor(
  tierId: string,
  prices: ExplicitPriceRow[] = [],
  tiers: PriceTierDefinition[] = TIERS,
): PricingContext {
  return new PricingContext(tierId, tiers, prices);
}

describe('PricingResolver', () => {
  let resolver: PricingResolver;

  beforeEach(() => {
    resolver = new PricingResolver(
      new ExplicitPriceStrategy(),
      new CostMultiplierStrategy(),
      new BaseTierPercentageStrategy(),
    );
  });

  describe('tier selection', () => {
    it('uses the company tier when the company has one', () => {
      expect(selectEffectiveTierId(PARTNER.id, STANDARD.id)).toBe(PARTNER.id);
    });

    it('falls back to the default tier when the company has none', () => {
      expect(selectEffectiveTierId(null, STANDARD.id)).toBe(STANDARD.id);
    });

    it('fails loudly when there is no default tier at all', () => {
      expect(() => selectEffectiveTierId(null, null)).toThrow(
        DefaultPriceTierMissingError,
      );
    });
  });

  describe('explicit pricing', () => {
    it('returns the manually entered price', () => {
      const context = contextFor(STANDARD.id, [
        {
          tierId: STANDARD.id,
          itemType: 'dish',
          itemId: CURRY.id,
          priceCents: 899,
        },
      ]);

      const result = resolver.resolve(context, CURRY);

      expect(result).toEqual({
        status: 'PRICED',
        priceCents: 899,
        source: 'EXPLICIT',
        resolvedFromTierId: STANDARD.id,
      });
    });

    it('lets an override beat the derived price', () => {
      const derivedOnly = contextFor(ENTERPRISE.id);
      const overridden = contextFor(ENTERPRISE.id, [
        {
          tierId: ENTERPRISE.id,
          itemType: 'dish',
          itemId: CURRY.id,
          priceCents: 500,
        },
      ]);

      const derived = resolver.resolve(derivedOnly, CURRY);
      const override = resolver.resolve(overridden, CURRY);

      expect(isPriced(derived) && derived.priceCents).toBe(215);
      expect(isPriced(override) && override.priceCents).toBe(500);
      expect(isPriced(override) && override.source).toBe('EXPLICIT');
    });

    it('restores the derived price when the override is cleared', () => {
      const before = resolver.resolve(
        contextFor(ENTERPRISE.id, [
          {
            tierId: ENTERPRISE.id,
            itemType: 'dish',
            itemId: CURRY.id,
            priceCents: 500,
          },
        ]),
        CURRY,
      );
      // Clearing an override removes the row, which is exactly a context
      // without that explicit price.
      const after = resolver.resolve(contextFor(ENTERPRISE.id), CURRY);

      expect(isPriced(before) && before.priceCents).toBe(500);
      expect(isPriced(after) && after.priceCents).toBe(215);
      expect(isPriced(after) && after.source).toBe('DERIVED');
    });
  });

  describe('derivation', () => {
    it('computes cost x 2.4', () => {
      const result = resolver.resolve(contextFor(ENTERPRISE.id), WRAP);

      // 400 x 2.4 = 960, already a multiple of 5.
      expect(isPriced(result) && result.priceCents).toBe(960);
    });

    it('rounds $0.88 x 2.4 up to $2.15', () => {
      const result = resolver.resolve(contextFor(ENTERPRISE.id), CURRY);

      expect(isPriced(result) && result.priceCents).toBe(215);
    });

    it('leaves an exact multiple of 5 cents unchanged', () => {
      const result = resolver.resolve(
        contextFor(ENTERPRISE.id),
        { id: 'dish-round', type: 'dish', costCents: 500 },
      );

      // 500 x 2.4 = 1200 exactly.
      expect(isPriced(result) && result.priceCents).toBe(1200);
    });

    it('applies Standard + 15% to $8.99 giving $10.35', () => {
      const context = contextFor(PARTNER.id, [
        {
          tierId: STANDARD.id,
          itemType: 'dish',
          itemId: CURRY.id,
          priceCents: 899,
        },
      ]);

      const result = resolver.resolve(context, CURRY);

      expect(isPriced(result) && result.priceCents).toBe(1035);
      expect(isPriced(result) && result.source).toBe('DERIVED');
    });

    it('resolves a chained tier through its base', () => {
      const premium: PriceTierDefinition = {
        id: 'tier-premium',
        code: 'PREMIUM',
        name: 'Premium',
        strategy: 'BASE_MARKUP',
        markupBasisPoints: 1_000,
        baseTierId: PARTNER.id,
      };

      const context = contextFor(
        premium.id,
        [
          {
            tierId: STANDARD.id,
            itemType: 'dish',
            itemId: CURRY.id,
            priceCents: 899,
          },
        ],
        [...TIERS, premium],
      );

      // Standard 899 -> Partner +15% = 1035 -> Premium +10% = 1138.5 -> 1140.
      const result = resolver.resolve(context, CURRY);

      expect(isPriced(result) && result.priceCents).toBe(1140);
      expect(context.chain().map((tier) => tier.id)).toEqual([
        premium.id,
        PARTNER.id,
        STANDARD.id,
      ]);
    });

    it('prices options with the same rules as dishes', () => {
      const derived = resolver.resolve(contextFor(ENTERPRISE.id), PANEER);
      const explicit = resolver.resolve(
        contextFor(STANDARD.id, [
          {
            tierId: STANDARD.id,
            itemType: 'option',
            itemId: PANEER.id,
            priceCents: 250,
          },
        ]),
        PANEER,
      );

      expect(isPriced(derived) && derived.priceCents).toBe(240);
      expect(isPriced(explicit) && explicit.priceCents).toBe(250);
    });
  });

  describe('missing prices', () => {
    it('returns MISSING when an explicit tier has no price', () => {
      const result = resolver.resolve(contextFor(STANDARD.id), CURRY);

      expect(result).toEqual({
        status: 'MISSING',
        reason: 'NO_EXPLICIT_PRICE',
        missingAtTierId: STANDARD.id,
      });
    });

    it('propagates MISSING from a derived tier whose base has no price', () => {
      const result = resolver.resolve(contextFor(PARTNER.id), CURRY);

      expect(result).toEqual({
        status: 'MISSING',
        reason: 'NO_EXPLICIT_PRICE',
        missingAtTierId: STANDARD.id,
      });
    });

    it('never reports a missing price as zero', () => {
      const result = resolver.resolve(contextFor(STANDARD.id), CURRY);

      expect(isPriced(result)).toBe(false);
      expect(result).not.toHaveProperty('priceCents');
      expect(JSON.stringify(result)).not.toContain('"priceCents":0');
    });

    it('treats an over-deep chain as missing rather than recursing', () => {
      const deepTiers: PriceTierDefinition[] = [STANDARD];

      let previousId = STANDARD.id;

      for (let level = 1; level <= MAX_TIER_DERIVATION_DEPTH + 2; level += 1) {
        const tier: PriceTierDefinition = {
          id: `tier-${level}`,
          code: `T${level}`,
          name: `Tier ${level}`,
          strategy: 'BASE_MARKUP',
          markupBasisPoints: 1_000,
          baseTierId: previousId,
        };

        deepTiers.push(tier);
        previousId = tier.id;
      }

      const result = resolver.resolve(
        contextFor(previousId, [], deepTiers),
        CURRY,
      );

      expect(isPriced(result)).toBe(false);
      expect(result).toMatchObject({ reason: 'DERIVATION_TOO_DEEP' });
    });
  });

  describe('performance', () => {
    it('resolves many rows from one context without further lookups', () => {
      const context = contextFor(ENTERPRISE.id);
      const tierLookup = vi.spyOn(context, 'tier');

      const items: PricedItem[] = Array.from({ length: 500 }, (_, index) => ({
        id: `dish-${index}`,
        type: 'dish' as const,
        costCents: 100 + index,
      }));

      const results = items.map((item) => resolver.resolve(context, item));

      expect(results.every(isPriced)).toBe(true);
      // Only in-memory map reads; the context itself was loaded once.
      expect(tierLookup).toHaveBeenCalledTimes(items.length);
    });
  });
});

describe('validateTierChain', () => {
  const byId = new Map(TIERS.map((tier) => [tier.id, tier]));

  it('accepts a root tier', () => {
    expect(validateTierChain({ id: STANDARD.id, baseTierId: null }, byId)).toEqual(
      [STANDARD.id],
    );
  });

  it('accepts Partner -> Standard', () => {
    expect(
      validateTierChain({ id: PARTNER.id, baseTierId: STANDARD.id }, byId),
    ).toEqual([PARTNER.id, STANDARD.id]);
  });

  it('rejects a self-reference', () => {
    expect(() =>
      validateTierChain({ id: PARTNER.id, baseTierId: PARTNER.id }, byId),
    ).toThrow(TierSelfReferenceError);
  });

  it('rejects a cycle', () => {
    // Standard would derive from Partner, which already derives from Standard.
    const cyclic = new Map(byId);
    cyclic.set(STANDARD.id, { ...STANDARD, baseTierId: PARTNER.id });

    expect(() =>
      validateTierChain({ id: STANDARD.id, baseTierId: PARTNER.id }, cyclic),
    ).toThrow(TierCycleError);
  });

  it('rejects a chain deeper than the maximum', () => {
    const deep = new Map<string, PriceTierDefinition>();

    deep.set(STANDARD.id, STANDARD);

    let previousId = STANDARD.id;

    for (let level = 1; level <= MAX_TIER_DERIVATION_DEPTH + 1; level += 1) {
      const tier: PriceTierDefinition = {
        id: `tier-${level}`,
        code: `T${level}`,
        name: `Tier ${level}`,
        strategy: 'BASE_MARKUP',
        markupBasisPoints: 1_000,
        baseTierId: previousId,
      };

      deep.set(tier.id, tier);
      previousId = tier.id;
    }

    expect(() =>
      validateTierChain({ id: 'tier-new', baseTierId: previousId }, deep),
    ).toThrow(TierDepthExceededError);
  });
});
