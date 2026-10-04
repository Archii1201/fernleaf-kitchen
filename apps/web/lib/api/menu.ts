import { get, send } from './client';

export interface MenuCategoryAdmin {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
  isSecret: boolean;
  active: boolean;
  dishes: {
    dishId: string;
    displayOrder: number;
    active: boolean;
    dish: { id: string; sku: string; name: string; active: boolean };
  }[];
}

export interface MenuPreviewDish {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceCents: number;
  source: 'EXPLICIT' | 'DERIVED';
}

export interface MenuPreview {
  company: { id: string; name: string };
  employee: { id: string; fullName: string } | null;
  priceTier: { id: string; name: string; code?: string };
  categories: { id: string; slug: string; name: string; isSecret: boolean; dishes: MenuPreviewDish[] }[];
}

export const listCategories = () => get<MenuCategoryAdmin[]>('/menu/categories');
export const createCategory = (body: { name: string; slug: string; isSecret?: boolean; displayOrder?: number }) =>
  send<MenuCategoryAdmin>('POST', '/menu/categories', body);
export const updateCategory = (id: string, body: { name?: string; slug?: string; isSecret?: boolean; active?: boolean }) =>
  send<MenuCategoryAdmin>('PATCH', `/menu/categories/${id}`, body);
export const reorderCategories = (categoryIds: string[]) =>
  send<MenuCategoryAdmin[]>('PUT', '/menu/categories/order', { categoryIds });
export const replaceCategoryDishes = (id: string, dishes: { dishId: string; active: boolean }[]) =>
  send<MenuCategoryAdmin>('PUT', `/menu/categories/${id}/dishes`, {
    dishes: dishes.map((dish, displayOrder) => ({ ...dish, displayOrder })),
  });
export const updateCategoryDish = (id: string, dishId: string, body: { active?: boolean; displayOrder?: number }) =>
  send('PATCH', `/menu/categories/${id}/dishes/${dishId}`, body);
export const previewMenu = (q: { companyId?: string; employeeId?: string }) => get<MenuPreview>('/menu', q);
