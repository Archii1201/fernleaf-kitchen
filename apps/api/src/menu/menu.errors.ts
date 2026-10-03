import {
  ConflictDomainError,
  NotFoundDomainError,
  ValidationDomainError,
} from '../common/errors/index.js';
import type { MenuUnavailableReason } from './domain/menu.types.js';

export class MenuCategoryNotFoundError extends NotFoundDomainError {
  constructor(slug: string) {
    super({
      code: 'MENU_CATEGORY_NOT_FOUND',
      message: 'Menu category not found.',
      details: { slug },
    });
  }
}

export class MenuCategoryConflictError extends ConflictDomainError {
  constructor(field: 'slug' | 'name', value: string) {
    super({
      code: 'MENU_CATEGORY_ALREADY_EXISTS',
      message: `Another menu category already uses this ${field}.`,
      details: { field, value },
    });
  }
}

export class MenuCategoryIdNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'MENU_CATEGORY_NOT_FOUND',
      message: 'Menu category not found.',
      details: { id },
    });
  }
}

export class MenuCategoryUnavailableError extends ValidationDomainError {
  constructor(slug: string, reason: MenuUnavailableReason) {
    super({
      code: 'MENU_CATEGORY_UNAVAILABLE',
      message: 'That menu category is not available to this company.',
      details: { slug, reason },
    });
  }
}

/**
 * Thrown by the order-validation seam. Preview uses the same reason codes
 * but filters quietly; an order must fail loudly.
 */
export class DishNotOrderableError extends ValidationDomainError {
  constructor(
    dishId: string,
    reason: MenuUnavailableReason,
    categoryId?: string,
  ) {
    super({
      code: 'DISH_NOT_ORDERABLE',
      message:
        'That dish is not available on this company menu. It cannot be ordered.',
      details: { dishId, categoryId, reason },
    });
  }
}

export class MenuEmployeeCompanyMismatchError extends ValidationDomainError {
  constructor(employeeId: string, companyId: string) {
    super({
      code: 'MENU_EMPLOYEE_COMPANY_MISMATCH',
      message: 'That employee does not belong to the requested company.',
      details: { employeeId, companyId },
    });
  }
}

export class MenuContextRequiredError extends ValidationDomainError {
  constructor() {
    super({
      code: 'MENU_CONTEXT_REQUIRED',
      message: 'A companyId or employeeId is required to resolve a menu.',
    });
  }
}
