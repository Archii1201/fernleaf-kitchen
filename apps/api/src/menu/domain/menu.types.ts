import type { PriceSource } from '../../pricing/domain/pricing.types.js';

/**
 * Why a dish is not on this company's orderable menu. Callers (preview and
 * later Orders) share these reasons so they can never disagree.
 */
export const MENU_UNAVAILABLE_REASONS = [
  'CATEGORY_INACTIVE',
  'DISH_INACTIVE',
  'MEMBERSHIP_INACTIVE',
  'CATEGORY_HIDDEN',
  'DISH_HIDDEN',
  'MISSING_PRICE',
  'CATEGORY_SECRET',
] as const;

export type MenuUnavailableReason = (typeof MENU_UNAVAILABLE_REASONS)[number];

/**
 * `listing` is the normal category browse. Secret categories are omitted.
 * `direct` is an explicit slug (or an order line already pointing at a dish):
 * a secret category is allowed through, but every other rule still applies.
 */
export type MenuViewMode = 'listing' | 'direct';

export interface MenuCategoryFacts {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
  isSecret: boolean;
  active: boolean;
}

export interface MenuDishFacts {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  costCents: number;
  active: boolean;
}

export interface MenuMembershipFacts {
  categoryId: string;
  dishId: string;
  displayOrder: number;
  active: boolean;
}

export interface AvailableMenuItem {
  status: 'AVAILABLE';
  dishId: string;
  categoryId: string;
  priceCents: number;
  source: PriceSource;
}

export interface UnavailableMenuItem {
  status: 'UNAVAILABLE';
  dishId: string;
  categoryId: string;
  reason: MenuUnavailableReason;
  priceCents: null;
  source: null;
}

export type MenuItemResolution = AvailableMenuItem | UnavailableMenuItem;

export function isAvailable(
  resolution: MenuItemResolution,
): resolution is AvailableMenuItem {
  return resolution.status === 'AVAILABLE';
}
