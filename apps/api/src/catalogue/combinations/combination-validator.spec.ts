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

const MILD = { id: 'opt-mild', name: 'Mild', active: true };
const HOT = { id: 'opt-hot', name: 'Hot', active: true };
const RETIRED = { id: 'opt-retired', name: 'Ghost pepper', active: false };
const NAAN = { id: 'opt-naan', name: 'Naan', active: true };
const RICE = { id: 'opt-rice', name: 'Rice', active: true };

function dish(
  overrides: Partial<CombinationDishDefinition> = {},
): CombinationDishDefinition {
  return {
    id: 'dish-1',
    name: 'Paneer Curry',
    active: true,
    minimumOrderQuantity: null,
    optionGroups: [
      {
        id: 'grp-spice',
        name: 'Spice level',
        required: true,
        maxSelections: 1,
        options: [MILD, HOT, RETIRED],
      },
      {
        id: 'grp-side',
        name: 'Side',
        required: false,
        maxSelections: 2,
        options: [NAAN, RICE],
      },
    ],
    ...overrides,
  };
}

describe('CombinationValidator', () => {
  let validator: CombinationValidator;

  beforeEach(() => {
    validator = new CombinationValidator();
  });

  it('accepts a valid combination and returns its signature', () => {
    const result = validator.validate({
      dish: dish(),
      lineQuantity: 3,
      combinations: [
        {
          quantity: 3,
          selections: [{ optionGroupId: 'grp-spice', optionIds: [MILD.id] }],
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(3);
    expect(result[0].optionIds).toEqual([MILD.id]);
    expect(result[0].signature).toBe(MILD.id);
  });

  it('accepts several combinations whose quantities sum exactly', () => {
    const result = validator.validate({
      dish: dish(),
      lineQuantity: 10,
      combinations: [
        {
          quantity: 6,
          selections: [{ optionGroupId: 'grp-spice', optionIds: [MILD.id] }],
        },
        {
          quantity: 4,
          selections: [
            { optionGroupId: 'grp-spice', optionIds: [HOT.id] },
            { optionGroupId: 'grp-side', optionIds: [NAAN.id, RICE.id] },
          ],
        },
      ],
    });

    expect(result.map((entry) => entry.quantity)).toEqual([6, 4]);
    expect(new Set(result.map((entry) => entry.signature)).size).toBe(2);
  });

  it('produces an order-independent signature', () => {
    const [first] = validator.validate({
      dish: dish(),
      lineQuantity: 1,
      combinations: [
        {
          quantity: 1,
          selections: [
            { optionGroupId: 'grp-side', optionIds: [RICE.id, NAAN.id] },
            { optionGroupId: 'grp-spice', optionIds: [MILD.id] },
          ],
        },
      ],
    });

    expect(first.signature).toBe([MILD.id, NAAN.id, RICE.id].sort().join('|'));
  });

  it('rejects combination quantities that do not sum to the line quantity', () => {
    expect(() =>
      validator.validate({
        dish: dish(),
        lineQuantity: 5,
        combinations: [
          {
            quantity: 3,
            selections: [{ optionGroupId: 'grp-spice', optionIds: [MILD.id] }],
          },
        ],
      }),
    ).toThrow(CombinationQuantityMismatchError);
  });

  it('rejects a combination that omits a required group', () => {
    expect(() =>
      validator.validate({
        dish: dish(),
        lineQuantity: 1,
        combinations: [
          {
            quantity: 1,
            selections: [{ optionGroupId: 'grp-side', optionIds: [NAAN.id] }],
          },
        ],
      }),
    ).toThrow(RequiredOptionGroupMissingError);
  });

  it('rejects an option that does not belong to the selected group', () => {
    expect(() =>
      validator.validate({
        dish: dish(),
        lineQuantity: 1,
        combinations: [
          {
            quantity: 1,
            selections: [{ optionGroupId: 'grp-spice', optionIds: [NAAN.id] }],
          },
        ],
      }),
    ).toThrow(OptionNotInGroupError);
  });

  it('rejects an inactive dish', () => {
    expect(() =>
      validator.validate({
        dish: dish({ active: false }),
        lineQuantity: 1,
        combinations: [
          {
            quantity: 1,
            selections: [{ optionGroupId: 'grp-spice', optionIds: [MILD.id] }],
          },
        ],
      }),
    ).toThrow(DishUnavailableError);
  });

  it('rejects an inactive option', () => {
    expect(() =>
      validator.validate({
        dish: dish(),
        lineQuantity: 1,
        combinations: [
          {
            quantity: 1,
            selections: [
              { optionGroupId: 'grp-spice', optionIds: [RETIRED.id] },
            ],
          },
        ],
      }),
    ).toThrow(OptionUnavailableError);
  });

  it('rejects more selections than the group allows', () => {
    expect(() =>
      validator.validate({
        dish: dish(),
        lineQuantity: 1,
        combinations: [
          {
            quantity: 1,
            selections: [
              { optionGroupId: 'grp-spice', optionIds: [MILD.id, HOT.id] },
            ],
          },
        ],
      }),
    ).toThrow(MaxSelectionsExceededError);
  });

  it('rejects two combinations with the same signature', () => {
    expect(() =>
      validator.validate({
        dish: dish(),
        lineQuantity: 2,
        combinations: [
          {
            quantity: 1,
            selections: [{ optionGroupId: 'grp-spice', optionIds: [MILD.id] }],
          },
          {
            quantity: 1,
            selections: [{ optionGroupId: 'grp-spice', optionIds: [MILD.id] }],
          },
        ],
      }),
    ).toThrow(DuplicateCombinationError);
  });

  it('rejects a line below the dish minimum order quantity', () => {
    expect(() =>
      validator.validate({
        dish: dish({ minimumOrderQuantity: 5 }),
        lineQuantity: 3,
        combinations: [
          {
            quantity: 3,
            selections: [{ optionGroupId: 'grp-spice', optionIds: [MILD.id] }],
          },
        ],
      }),
    ).toThrow(MinimumOrderQuantityNotMetError);
  });

  it('allows unlimited selections when maxSelections is null', () => {
    const result = validator.validate({
      dish: dish({
        optionGroups: [
          {
            id: 'grp-side',
            name: 'Side',
            required: false,
            maxSelections: null,
            options: [NAAN, RICE],
          },
        ],
      }),
      lineQuantity: 1,
      combinations: [
        {
          quantity: 1,
          selections: [
            { optionGroupId: 'grp-side', optionIds: [NAAN.id, RICE.id] },
          ],
        },
      ],
    });

    expect(result[0].optionIds).toHaveLength(2);
  });
});
