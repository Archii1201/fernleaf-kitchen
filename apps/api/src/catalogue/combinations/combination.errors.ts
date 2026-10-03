import { ValidationDomainError } from '../../common/errors/index.js';

export class DishUnavailableError extends ValidationDomainError {
  constructor(dishId: string, dishName: string) {
    super({
      code: 'DISH_UNAVAILABLE',
      message: `"${dishName}" is no longer available and cannot be ordered.`,
      details: { dishId },
    });
  }
}

export class OptionUnavailableError extends ValidationDomainError {
  constructor(optionId: string, optionName: string) {
    super({
      code: 'OPTION_UNAVAILABLE',
      message: `The option "${optionName}" is no longer available.`,
      details: { optionId },
    });
  }
}

export class CombinationQuantityInvalidError extends ValidationDomainError {
  constructor(quantity: number) {
    super({
      code: 'COMBINATION_QUANTITY_INVALID',
      message: 'Every combination must have a quantity of at least 1.',
      details: { quantity },
    });
  }
}

export class CombinationQuantityMismatchError extends ValidationDomainError {
  constructor(lineQuantity: number, combinationTotal: number) {
    super({
      code: 'COMBINATION_QUANTITY_MISMATCH',
      message: `The combination quantities add up to ${combinationTotal}, but the line quantity is ${lineQuantity}. They must match exactly.`,
      details: { lineQuantity, combinationTotal },
    });
  }
}

export class MinimumOrderQuantityNotMetError extends ValidationDomainError {
  constructor(dishName: string, minimum: number, requested: number) {
    super({
      code: 'MINIMUM_ORDER_QUANTITY_NOT_MET',
      message: `"${dishName}" must be ordered in quantities of at least ${minimum}; ${requested} were requested.`,
      details: { minimumOrderQuantity: minimum, requested },
    });
  }
}

export class RequiredOptionGroupMissingError extends ValidationDomainError {
  constructor(optionGroupId: string, optionGroupName: string) {
    super({
      code: 'REQUIRED_OPTION_GROUP_MISSING',
      message: `Every combination must include a choice from "${optionGroupName}".`,
      details: { optionGroupId },
    });
  }
}

export class OptionGroupNotOnDishError extends ValidationDomainError {
  constructor(optionGroupId: string, dishName: string) {
    super({
      code: 'OPTION_GROUP_NOT_ON_DISH',
      message: `That option group is not offered for "${dishName}".`,
      details: { optionGroupId },
    });
  }
}

export class OptionNotInGroupError extends ValidationDomainError {
  constructor(optionId: string, optionGroupId: string, groupName: string) {
    super({
      code: 'OPTION_NOT_IN_GROUP',
      message: `The selected option does not belong to "${groupName}".`,
      details: { optionId, optionGroupId },
    });
  }
}

export class MaxSelectionsExceededError extends ValidationDomainError {
  constructor(groupName: string, maxSelections: number, selected: number) {
    super({
      code: 'MAX_SELECTIONS_EXCEEDED',
      message: `"${groupName}" allows at most ${maxSelections} selection(s); ${selected} were made.`,
      details: { maxSelections, selected },
    });
  }
}

export class DuplicateOptionSelectionError extends ValidationDomainError {
  constructor(optionId: string, optionGroupId: string) {
    super({
      code: 'DUPLICATE_OPTION_SELECTION',
      message: 'The same option was selected twice in one group.',
      details: { optionId, optionGroupId },
    });
  }
}

export class DuplicateCombinationError extends ValidationDomainError {
  constructor(signature: string) {
    super({
      code: 'DUPLICATE_COMBINATION',
      message:
        'Two combinations on this line have identical options. Merge them into one combination with a higher quantity.',
      details: { signature },
    });
  }
}
