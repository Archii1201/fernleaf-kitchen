/**
 * Plain shapes for the combination validator. They are deliberately not Prisma
 * types: the validator is a pure domain service that the future Orders module
 * can call with data loaded however it likes.
 */

export interface CombinationOptionDefinition {
  id: string;
  name: string;
  active: boolean;
}

export interface CombinationOptionGroupDefinition {
  id: string;
  name: string;
  required: boolean;
  /** Null means unlimited selections from this group. */
  maxSelections: number | null;
  options: CombinationOptionDefinition[];
}

export interface CombinationDishDefinition {
  id: string;
  name: string;
  active: boolean;
  /** `Dish.moq`; null means no minimum. */
  minimumOrderQuantity: number | null;
  optionGroups: CombinationOptionGroupDefinition[];
}

export interface SelectedOptionGroup {
  optionGroupId: string;
  optionIds: string[];
}

export interface SelectedCombination {
  quantity: number;
  selections: SelectedOptionGroup[];
}

export interface ValidateCombinationsInput {
  dish: CombinationDishDefinition;
  /** Quantity on the order line the combinations belong to. */
  lineQuantity: number;
  combinations: SelectedCombination[];
}

export interface ValidatedCombination {
  quantity: number;
  /** Deterministic fingerprint, stored as `OrderCombination.signature`. */
  signature: string;
  optionIds: string[];
  selections: SelectedOptionGroup[];
}
