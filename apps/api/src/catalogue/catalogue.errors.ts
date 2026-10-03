import {
  ConflictDomainError,
  NotFoundDomainError,
  ValidationDomainError,
} from '../common/errors/index.js';

export class DishNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'DISH_NOT_FOUND',
      message: 'Dish not found.',
      details: { id },
    });
  }
}

export class DishSkuConflictError extends ConflictDomainError {
  constructor(sku: string) {
    super({
      code: 'DISH_SKU_ALREADY_EXISTS',
      message: 'Another dish already uses this SKU.',
      details: { sku },
    });
  }
}

export class OptionNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'OPTION_NOT_FOUND',
      message: 'Option not found.',
      details: { id },
    });
  }
}

export class OptionGroupNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'OPTION_GROUP_NOT_FOUND',
      message: 'Option group not found.',
      details: { id },
    });
  }
}

export class CatalogueCodeConflictError extends ConflictDomainError {
  constructor(entity: 'option' | 'optionGroup', code: string) {
    super({
      code: 'CATALOGUE_CODE_ALREADY_EXISTS',
      message: 'Another record already uses this code.',
      details: { entity, conflictingCode: code },
    });
  }
}

export class ReferenceConflictError extends ConflictDomainError {
  constructor(entity: string, field: 'code' | 'name', value: string) {
    super({
      code: 'REFERENCE_ALREADY_EXISTS',
      message: `Another ${entity} already uses this ${field}.`,
      details: { entity, field, value },
    });
  }
}

/** A referenced reference-data row (station, allergen, tag, file) is missing. */
export class UnknownReferenceError extends ValidationDomainError {
  constructor(reference: string, ids: readonly string[]) {
    super({
      code: 'UNKNOWN_REFERENCE',
      message: `One or more ${reference} references do not exist.`,
      details: { reference, ids: [...ids] },
    });
  }
}
