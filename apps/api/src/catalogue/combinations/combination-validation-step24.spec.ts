import { beforeEach, describe, expect, it } from 'vitest';
import { CombinationValidator } from './combination-validator.js';
import {
  CombinationQuantityMismatchError,
  DishUnavailableError,
  DuplicateCombinationError,
  MaxSelectionsExceededError,
  MinimumOrderQuantityNotMetError,
  OptionNotInGroupError,
  OptionUnavailableError,
  RequiredOptionGroupMissingError,
} from './combination.errors.js';
import type { CombinationDishDefinition } from './combination.types.js';

describe('Step 24 Part 3: Combination Validation Tests', () => {
  let validator: CombinationValidator;

  const MILD = { id: 'opt-spice-mild', name: 'Mild', active: true };
  const MEDIUM = { id: 'opt-spice-med', name: 'Medium', active: true };
  const EXTRA_HOT = { id: 'opt-spice-exhot', name: 'Extra Hot', active: false }; // inactive
  const NAAN = { id: 'opt-side-naan', name: 'Garlic Naan', active: true };
  const RICE = { id: 'opt-side-rice', name: 'Jeera Rice', active: true };
  const SALAD = { id: 'opt-side-salad', name: 'Green Salad', active: true };
  const FOREIGN_OPT = { id: 'opt-beverage-coke', name: 'Cola', active: true }; // does not belong to group

  function createTestDish(overrides: Partial<CombinationDishDefinition> = {}): CombinationDishDefinition {
    return {
      id: 'dish-thali-001',
      name: 'Executive Thali',
      active: true,
      minimumOrderQuantity: null,
      optionGroups: [
        {
          id: 'grp-spice-level',
          name: 'Spice Level',
          required: true,
          maxSelections: 1,
          options: [MILD, MEDIUM, EXTRA_HOT],
        },
        {
          id: 'grp-sides',
          name: 'Choice of Sides',
          required: false,
          maxSelections: 2,
          options: [NAAN, RICE, SALAD],
        },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    validator = new CombinationValidator();
  });

  describe('Case 1: Exact quantity', () => {
    it('accepts combination batches whose quantities sum exactly to line quantity', () => {
      const dish = createTestDish();
      const result = validator.validate({
        dish,
        lineQuantity: 10,
        combinations: [
          {
            quantity: 6,
            selections: [{ optionGroupId: 'grp-spice-level', optionIds: [MILD.id] }],
          },
          {
            quantity: 4,
            selections: [
              { optionGroupId: 'grp-spice-level', optionIds: [MEDIUM.id] },
              { optionGroupId: 'grp-sides', optionIds: [NAAN.id] },
            ],
          },
        ],
      });

      expect(result).toHaveLength(2);
      expect(result.reduce((sum, c) => sum + c.quantity, 0)).toBe(10);
    });
  });

  describe('Case 2: Too few combinations', () => {
    it('rejects when combination quantities sum to less than order line quantity', () => {
      const dish = createTestDish();
      expect(() =>
        validator.validate({
          dish,
          lineQuantity: 10,
          combinations: [
            {
              quantity: 7, // 7 < 10
              selections: [{ optionGroupId: 'grp-spice-level', optionIds: [MILD.id] }],
            },
          ],
        }),
      ).toThrow(CombinationQuantityMismatchError);
    });
  });

  describe('Case 3: Too many combinations', () => {
    it('rejects when combination quantities sum to more than order line quantity', () => {
      const dish = createTestDish();
      expect(() =>
        validator.validate({
          dish,
          lineQuantity: 10,
          combinations: [
            {
              quantity: 12, // 12 > 10
              selections: [{ optionGroupId: 'grp-spice-level', optionIds: [MILD.id] }],
            },
          ],
        }),
      ).toThrow(CombinationQuantityMismatchError);
    });
  });

  describe('Case 4: Missing required group', () => {
    it('rejects combination when a required option group has no selections', () => {
      const dish = createTestDish();
      // 'grp-spice-level' is required, but only 'grp-sides' was provided
      expect(() =>
        validator.validate({
          dish,
          lineQuantity: 2,
          combinations: [
            {
              quantity: 2,
              selections: [{ optionGroupId: 'grp-sides', optionIds: [NAAN.id] }],
            },
          ],
        }),
      ).toThrow(RequiredOptionGroupMissingError);
    });
  });

  describe('Case 5: Invalid option not belonging to group', () => {
    it('rejects an option ID that does not belong to the allowed option group', () => {
      const dish = createTestDish();
      expect(() =>
        validator.validate({
          dish,
          lineQuantity: 1,
          combinations: [
            {
              quantity: 1,
              selections: [
                { optionGroupId: 'grp-spice-level', optionIds: [FOREIGN_OPT.id] },
              ],
            },
          ],
        }),
      ).toThrow(OptionNotInGroupError);
    });
  });

  describe('Case 6: Inactive option', () => {
    it('rejects selection of an inactive option', () => {
      const dish = createTestDish();
      // EXTRA_HOT has active: false
      expect(() =>
        validator.validate({
          dish,
          lineQuantity: 1,
          combinations: [
            {
              quantity: 1,
              selections: [
                { optionGroupId: 'grp-spice-level', optionIds: [EXTRA_HOT.id] },
              ],
            },
          ],
        }),
      ).toThrow(OptionUnavailableError);
    });
  });

  describe('Case 7: Duplicate signature', () => {
    it('rejects combinations that specify identical option signatures in the same line', () => {
      const dish = createTestDish();
      expect(() =>
        validator.validate({
          dish,
          lineQuantity: 4,
          combinations: [
            {
              quantity: 2,
              selections: [{ optionGroupId: 'grp-spice-level', optionIds: [MILD.id] }],
            },
            {
              quantity: 2,
              selections: [{ optionGroupId: 'grp-spice-level', optionIds: [MILD.id] }], // duplicate signature
            },
          ],
        }),
      ).toThrow(DuplicateCombinationError);
    });
  });

  describe('Case 8: Maximum selections exceeded', () => {
    it('rejects when option count exceeds maxSelections for that option group', () => {
      const dish = createTestDish();
      // 'grp-spice-level' has maxSelections: 1, selecting 2 options must fail
      expect(() =>
        validator.validate({
          dish,
          lineQuantity: 1,
          combinations: [
            {
              quantity: 1,
              selections: [
                { optionGroupId: 'grp-spice-level', optionIds: [MILD.id, MEDIUM.id] },
              ],
            },
          ],
        }),
      ).toThrow(MaxSelectionsExceededError);
    });
  });

  describe('Case 9: Minimum order quantity (MOQ)', () => {
    it('rejects order line quantity below the dish minimumOrderQuantity', () => {
      const dishWithMoq = createTestDish({ minimumOrderQuantity: 15 });
      expect(() =>
        validator.validate({
          dish: dishWithMoq,
          lineQuantity: 10, // 10 < 15
          combinations: [
            {
              quantity: 10,
              selections: [{ optionGroupId: 'grp-spice-level', optionIds: [MILD.id] }],
            },
          ],
        }),
      ).toThrow(MinimumOrderQuantityNotMetError);
    });

    it('accepts order line quantity meeting or exceeding the minimumOrderQuantity', () => {
      const dishWithMoq = createTestDish({ minimumOrderQuantity: 10 });
      const result = validator.validate({
        dish: dishWithMoq,
        lineQuantity: 10,
        combinations: [
          {
            quantity: 10,
            selections: [{ optionGroupId: 'grp-spice-level', optionIds: [MILD.id] }],
          },
        ],
      });
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(10);
    });
  });
});
