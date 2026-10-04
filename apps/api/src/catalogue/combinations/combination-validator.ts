import { Injectable } from '@nestjs/common';
import {
  CombinationQuantityInvalidError,
  CombinationQuantityMismatchError,
  DishUnavailableError,
  DuplicateCombinationError,
  DuplicateOptionSelectionError,
  MaxSelectionsExceededError,
  MinimumOrderQuantityNotMetError,
  OptionGroupNotOnDishError,
  OptionNotInGroupError,
  OptionUnavailableError,
  RequiredOptionGroupMissingError,
} from './combination.errors.js';
import type {
  CombinationOptionGroupDefinition,
  SelectedCombination,
  ValidateCombinationsInput,
  ValidatedCombination,
} from './combination.types.js';

/** Signature of a combination with no options selected. */
export const EMPTY_COMBINATION_SIGNATURE = 'no-options';

/**
 * Pure domain service: no Prisma, no HTTP, no clock. The Orders module will
 * call it before persisting a line, and it returns the signatures that go into
 * `OrderCombination.signature`.
 *
 * Rules enforced, in order:
 *  1. the dish is still available;
 *  2. every combination quantity is positive and they sum **exactly** to the
 *     line quantity;
 *  3. the line quantity respects the dish minimum order quantity;
 *  4. every selected group is offered by the dish, every selected option
 *     belongs to that group and is still active;
 *  5. `maxSelections` per group is respected;
 *  6. every required group is satisfied in every combination;
 *  7. no two combinations on the line have the same signature.
 */
@Injectable()
export class CombinationValidator {
  validate(input: ValidateCombinationsInput): ValidatedCombination[] {
    const { dish, lineQuantity, combinations } = input;

    if (!dish.active) {
      throw new DishUnavailableError(dish.id, dish.name);
    }

    if (!Number.isInteger(lineQuantity) || lineQuantity < 1) {
      throw new CombinationQuantityInvalidError(lineQuantity);
    }

    if (
      dish.minimumOrderQuantity !== null &&
      lineQuantity < dish.minimumOrderQuantity
    ) {
      throw new MinimumOrderQuantityNotMetError(
        dish.name,
        dish.minimumOrderQuantity,
        lineQuantity,
      );
    }

    const groups = new Map(dish.optionGroups.map((group) => [group.id, group]));
    const validated: ValidatedCombination[] = [];
    const seenSignatures = new Set<string>();
    let combinationTotal = 0;

    for (const combination of combinations) {
      if (
        !Number.isInteger(combination.quantity) ||
        combination.quantity < 1
      ) {
        throw new CombinationQuantityInvalidError(combination.quantity);
      }

      combinationTotal += combination.quantity;

      const optionIds = this.validateSelections(combination, groups, dish.name);
      const signature = this.buildSignature(optionIds);

      if (seenSignatures.has(signature)) {
        throw new DuplicateCombinationError(signature);
      }

      seenSignatures.add(signature);

      validated.push({
        quantity: combination.quantity,
        signature,
        optionIds,
        selections: combination.selections,
      });
    }

    if (combinationTotal !== lineQuantity) {
      throw new CombinationQuantityMismatchError(
        lineQuantity,
        combinationTotal,
      );
    }

    return validated;
  }

  /** Sorted option ids joined with `|`, so the signature is order-independent. */
  buildSignature(optionIds: readonly string[]): string {
    if (optionIds.length === 0) {
      return EMPTY_COMBINATION_SIGNATURE;
    }

    return [...optionIds].sort().join('|');
  }

  private validateSelections(
    combination: SelectedCombination,
    groups: ReadonlyMap<string, CombinationOptionGroupDefinition>,
    dishName: string,
  ): string[] {
    const selectedIds: string[] = [];
    const satisfiedGroups = new Set<string>();
    const selectionsByGroup = new Map<string, Set<string>>();

    for (const selection of combination.selections) {
      const group = groups.get(selection.optionGroupId);

      if (!group) {
        throw new OptionGroupNotOnDishError(selection.optionGroupId, dishName);
      }

      const seenInGroup = selectionsByGroup.get(group.id) ?? new Set<string>();
      selectionsByGroup.set(group.id, seenInGroup);

      for (const optionId of selection.optionIds) {
        if (seenInGroup.has(optionId)) {
          throw new DuplicateOptionSelectionError(optionId, group.id);
        }

        seenInGroup.add(optionId);

        const option = group.options.find((entry) => entry.id === optionId);

        if (!option) {
          throw new OptionNotInGroupError(optionId, group.id, group.name);
        }

        if (!option.active) {
          throw new OptionUnavailableError(option.id, option.name);
        }

        selectedIds.push(option.id);
      }

      if (
        group.maxSelections !== null &&
        seenInGroup.size > group.maxSelections
      ) {
        throw new MaxSelectionsExceededError(
          group.name,
          group.maxSelections,
          seenInGroup.size,
        );
      }

      if (selection.optionIds.length > 0) {
        satisfiedGroups.add(group.id);
      }
    }

    for (const group of groups.values()) {
      if (group.required && !satisfiedGroups.has(group.id)) {
        throw new RequiredOptionGroupMissingError(group.id, group.name);
      }
    }

    return selectedIds;
  }
}
