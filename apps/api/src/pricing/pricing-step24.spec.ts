import { beforeEach, describe, expect, it } from 'vitest';
import {
  DefaultPriceTierMissingError,
  MoneyError,
  TierCycleError,
  TierDepthExceededError,
  TierSelfReferenceError,
} from './pricing.errors.js';
import { Money, roundUpRational, assertBasisPoints, ROUNDING_STEP_CENTS } from './domain/money.js';
import { PricingContext } from './domain/pricing-context.js';
import { PricingResolver } from './domain/pricing-resolver.js';
import {
  isPriced,
  type ExplicitPriceRow,
  type PriceTierDefinition,
  type PricedItem,
} from './domain/pricing.types.js';
import { BaseTierPercentageStrategy } from './domain/strategies/base-tier-percentage.strategy.js';
import { CostMultiplierStrategy } from './domain/strategies/cost-multiplier.strategy.js';
import { ExplicitPriceStrategy } from './domain/strategies/explicit-price.strategy.js';
import { MAX_TIER_DERIVATION_DEPTH, validateTierChain } from './domain/tier-chain.js';
import { selectEffectiveTierId } from './domain/tier-selection.js';

describe('Step 24 Part 2: Pricing Engine and Strategy Tests', () => {
  const DEFAULT_TIER: PriceTierDefinition = {
    id: 'tier-default',
    code: 'STANDARD',
    name: 'Standard Tier',
    strategy: 'EXPLICIT',
    markupBasisPoints: null,
    baseTierId: null,
  };

  const COMPANY_TIER: PriceTierDefinition = {
    id: 'tier-corporate',
    code: 'CORPORATE_PLUS',
    name: 'Corporate Plus',
    strategy: 'EXPLICIT',
    markupBasisPoints: null,
    baseTierId: null,
  };

  const PERCENTAGE_TIER: PriceTierDefinition = {
    id: 'tier-partner-pct',
    code: 'PARTNER_PCT',
    name: 'Partner Percentage',
    strategy: 'BASE_MARKUP',
    markupBasisPoints: 1_500, // +15%
    baseTierId: DEFAULT_TIER.id,
  };

  const MULTIPLIER_TIER: PriceTierDefinition = {
    id: 'tier-cost-mult',
    code: 'COST_MULT',
    name: 'Cost Multiplier Tier',
    strategy: 'COST_MULTIPLIER',
    markupBasisPoints: 24_000, // 2.4x
    baseTierId: null,
  };

  const ALL_TIERS = [DEFAULT_TIER, COMPANY_TIER, PERCENTAGE_TIER, MULTIPLIER_TIER];

  const DISH_A: PricedItem = { id: 'dish-curry', type: 'dish', costCents: 400 };
  const DISH_FRACTIONAL: PricedItem = { id: 'dish-fractional', type: 'dish', costCents: 88 };

  let resolver: PricingResolver;

  beforeEach(() => {
    resolver = new PricingResolver(
      new ExplicitPriceStrategy(),
      new CostMultiplierStrategy(),
      new BaseTierPercentageStrategy(),
    );
  });

  describe('Case 1: Default tier fallback', () => {
    it('uses the default tier when the company has no explicit price tier assigned', () => {
      const effectiveTierId = selectEffectiveTierId(null, DEFAULT_TIER.id);
      expect(effectiveTierId).toBe(DEFAULT_TIER.id);

      const effectiveWithEmpty = selectEffectiveTierId(undefined, DEFAULT_TIER.id);
      expect(effectiveWithEmpty).toBe(DEFAULT_TIER.id);
    });

    it('fails fast when no default tier is configured', () => {
      expect(() => selectEffectiveTierId(null, null)).toThrow(DefaultPriceTierMissingError);
    });
  });

  describe('Case 2: Company tier selection', () => {
    it('uses company-specific price tier when configured', () => {
      const effectiveTierId = selectEffectiveTierId(COMPANY_TIER.id, DEFAULT_TIER.id);
      expect(effectiveTierId).toBe(COMPANY_TIER.id);
    });
  });

  describe('Case 3: Explicit price overrides derived price', () => {
    it('prioritizes explicit price over derived pricing strategy', () => {
      // In MULTIPLIER_TIER, DISH_A (cost 400) would derive as 400 x 2.4 = 960 cents.
      // But if an explicit row sets price to 750 cents, 750 cents must win.
      const contextWithOverride = new PricingContext(
        MULTIPLIER_TIER.id,
        ALL_TIERS,
        [
          {
            tierId: MULTIPLIER_TIER.id,
            itemType: 'dish',
            itemId: DISH_A.id,
            priceCents: 750,
          },
        ],
      );

      const result = resolver.resolve(contextWithOverride, DISH_A);
      expect(isPriced(result)).toBe(true);
      if (isPriced(result)) {
        expect(result.priceCents).toBe(750);
        expect(result.source).toBe('EXPLICIT');
      }
    });
  });

  describe('Case 4: Derived price resolution', () => {
    it('computes derived price when no explicit override exists', () => {
      const context = new PricingContext(MULTIPLIER_TIER.id, ALL_TIERS, []);
      const result = resolver.resolve(context, DISH_A);

      expect(isPriced(result)).toBe(true);
      if (isPriced(result)) {
        expect(result.priceCents).toBe(960);
        expect(result.source).toBe('DERIVED');
      }
    });
  });

  describe('Case 5: Percentage strategy (base + percentage)', () => {
    it('derives price using base price + markup basis points', () => {
      // Standard has DISH_A at 899 cents.
      // PERCENTAGE_TIER has 1500 bp (+15%).
      // 899 + 15% = 899 * 1.15 = 1033.85 -> rounded up to 1035 cents.
      const prices: ExplicitPriceRow[] = [
        {
          tierId: DEFAULT_TIER.id,
          itemType: 'dish',
          itemId: DISH_A.id,
          priceCents: 899,
        },
      ];
      const context = new PricingContext(PERCENTAGE_TIER.id, ALL_TIERS, prices);
      const result = resolver.resolve(context, DISH_A);

      expect(isPriced(result)).toBe(true);
      if (isPriced(result)) {
        expect(result.priceCents).toBe(1035);
        expect(result.source).toBe('DERIVED');
      }
    });

    it('accurately computes 10% markup on an even base price', () => {
      const tenPercentTier: PriceTierDefinition = {
        id: 'tier-10pct',
        code: 'TEN_PCT',
        name: 'Ten Percent Tier',
        strategy: 'BASE_MARKUP',
        markupBasisPoints: 1_000, // +10%
        baseTierId: DEFAULT_TIER.id,
      };
      const prices: ExplicitPriceRow[] = [
        {
          tierId: DEFAULT_TIER.id,
          itemType: 'dish',
          itemId: DISH_A.id,
          priceCents: 1000,
        },
      ];
      const context = new PricingContext(
        tenPercentTier.id,
        [...ALL_TIERS, tenPercentTier],
        prices,
      );
      const result = resolver.resolve(context, DISH_A);

      expect(isPriced(result)).toBe(true);
      if (isPriced(result)) {
        expect(result.priceCents).toBe(1100);
      }
    });
  });

  describe('Case 6: Cost multiplier strategy (cost × multiplier)', () => {
    it('derives price as dish cost multiplied by multiplier basis points', () => {
      // Cost 400 cents, multiplier 24000 bp (2.4x) -> 960 cents
      const context = new PricingContext(MULTIPLIER_TIER.id, ALL_TIERS, []);
      const result = resolver.resolve(context, DISH_A);

      expect(isPriced(result)).toBe(true);
      if (isPriced(result)) {
        expect(result.priceCents).toBe(960);
        expect(result.source).toBe('DERIVED');
      }
    });
  });

  describe('Case 7: Rounding up to 5-cent increment (no floating-point money)', () => {
    it('rounds derived fractional prices strictly UP to the next 5-cent multiple', () => {
      // DISH_FRACTIONAL cost = 88 cents. 88 * 2.4 = 211.2 cents.
      // Must round UP to 215 cents, never down to 210 cents.
      const context = new PricingContext(MULTIPLIER_TIER.id, ALL_TIERS, []);
      const result = resolver.resolve(context, DISH_FRACTIONAL);

      expect(isPriced(result)).toBe(true);
      if (isPriced(result)) {
        expect(result.priceCents).toBe(215);
      }
    });

    it('verifies roundUpRational integer rounding steps', () => {
      expect(ROUNDING_STEP_CENTS).toBe(5);

      // Exact multiples of 5 remain unchanged
      expect(roundUpRational(100, 1)).toBe(100);
      expect(roundUpRational(105, 1)).toBe(105);

      // Amounts between multiples always round UP
      expect(roundUpRational(101, 1)).toBe(105);
      expect(roundUpRational(102, 1)).toBe(105);
      expect(roundUpRational(103, 1)).toBe(105);
      expect(roundUpRational(104, 1)).toBe(105);
      expect(roundUpRational(106, 1)).toBe(110);
    });
  });

  describe('Case 8: Missing price behavior', () => {
    it('returns MISSING when an explicit tier has no price row, and never reports price as zero', () => {
      const context = new PricingContext(DEFAULT_TIER.id, ALL_TIERS, []);
      const result = resolver.resolve(context, DISH_A);

      expect(isPriced(result)).toBe(false);
      expect(result.status).toBe('MISSING');
      if (!isPriced(result)) {
        expect(result.reason).toBe('NO_EXPLICIT_PRICE');
      }
      expect(result).not.toHaveProperty('priceCents');
      expect(JSON.stringify(result)).not.toContain('"priceCents":0');
    });
  });

  describe('Case 9: Pricing derivation cycle detection', () => {
    it('detects and rejects cyclical tier inheritance', () => {
      // Tier A -> Tier B -> Tier A
      const tierA: PriceTierDefinition = {
        id: 'tier-cycle-a',
        code: 'CYCLE_A',
        name: 'Cycle A',
        strategy: 'BASE_MARKUP',
        markupBasisPoints: 500,
        baseTierId: 'tier-cycle-b',
      };
      const tierB: PriceTierDefinition = {
        id: 'tier-cycle-b',
        code: 'CYCLE_B',
        name: 'Cycle B',
        strategy: 'BASE_MARKUP',
        markupBasisPoints: 500,
        baseTierId: 'tier-cycle-a',
      };

      const tierMap = new Map<string, PriceTierDefinition>([
        [tierA.id, tierA],
        [tierB.id, tierB],
      ]);

      expect(() =>
        validateTierChain({ id: tierA.id, baseTierId: tierA.baseTierId }, tierMap),
      ).toThrow(TierCycleError);
    });

    it('rejects self-referencing tier', () => {
      const selfTier: PriceTierDefinition = {
        id: 'tier-self',
        code: 'SELF',
        name: 'Self Tier',
        strategy: 'BASE_MARKUP',
        markupBasisPoints: 500,
        baseTierId: 'tier-self',
      };
      const tierMap = new Map([[selfTier.id, selfTier]]);

      expect(() =>
        validateTierChain({ id: selfTier.id, baseTierId: selfTier.id }, tierMap),
      ).toThrow(TierSelfReferenceError);
    });
  });

  describe('Case 10: Derivation depth limit', () => {
    it('rejects derivation chains exceeding MAX_TIER_DERIVATION_DEPTH', () => {
      const deepMap = new Map<string, PriceTierDefinition>([[DEFAULT_TIER.id, DEFAULT_TIER]]);
      let previousId = DEFAULT_TIER.id;

      for (let i = 1; i <= MAX_TIER_DERIVATION_DEPTH + 1; i++) {
        const tier: PriceTierDefinition = {
          id: `tier-deep-${i}`,
          code: `DEEP_${i}`,
          name: `Deep ${i}`,
          strategy: 'BASE_MARKUP',
          markupBasisPoints: 500,
          baseTierId: previousId,
        };
        deepMap.set(tier.id, tier);
        previousId = tier.id;
      }

      expect(() =>
        validateTierChain({ id: 'tier-deep-excess', baseTierId: previousId }, deepMap),
      ).toThrow(TierDepthExceededError);
    });
  });

  describe('Case 11: Negative and invalid money rejection', () => {
    it('rejects negative cents amounts in Money value object', () => {
      expect(() => Money.fromCents(-100)).toThrow(MoneyError);
      expect(() => Money.fromCents(-1)).toThrow(MoneyError);
    });

    it('rejects negative basis points', () => {
      expect(() => assertBasisPoints(-1000)).toThrow(MoneyError);
    });

    it('rejects non-integer money amounts', () => {
      expect(() => Money.fromCents(12.34)).toThrow(MoneyError);
    });
  });
});
