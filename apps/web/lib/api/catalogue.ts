import { get, send, type Paginated, type Query } from './client';

export interface RefItem {
  id: string;
  code: string;
  name: string;
  active?: boolean;
  sortOrder?: number;
}

export type RefKind = 'allergens' | 'dietary-tags' | 'kitchen-stations' | 'portion-sizes' | 'packaging-types';

export const TEMPERATURES = ['HOT', 'COLD', 'AMBIENT'] as const;

export interface Dish {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  temperature: (typeof TEMPERATURES)[number];
  costCents: number;
  minimumOrderQuantity: number | null;
  active: boolean;
  imageFileId: string | null;
  kitchenStation: RefItem;
  portionSize: RefItem | null;
  allergens: RefItem[];
  dietaryTags: RefItem[];
  optionGroups: { id: string; code: string; name: string; required: boolean; displayOrder: number }[];
}

export interface DishInput {
  name: string;
  description?: string;
  sku: string;
  temperature: string;
  costCents: number;
  kitchenStationId: string;
  portionSizeId?: string;
  imageFileId?: string;
  minimumOrderQuantity?: number;
  allergenIds?: string[];
  dietaryTagIds?: string[];
}

export interface Option {
  id: string;
  code: string;
  name: string;
  description: string | null;
  costCents: number;
  active: boolean;
  portionSize: RefItem | null;
  allergens: RefItem[];
  dietaryTags: RefItem[];
}

export interface OptionGroup {
  id: string;
  code: string;
  name: string;
  required: boolean;
  displayOrder: number;
  maxSelections: number | null;
  active: boolean;
  options: {
    id: string;
    code: string;
    name: string;
    costCents: number;
    active: boolean;
    displayOrder: number;
    membershipActive: boolean;
  }[];
}

export const listDishes = (q: Query) => get<Paginated<Dish>>('/dishes', q);
export const getDish = (id: string) => get<Dish>(`/dishes/${id}`);
export const createDish = (body: DishInput) => send<Dish>('POST', '/dishes', body);
export const updateDish = (id: string, body: Partial<DishInput>) => send<Dish>('PATCH', `/dishes/${id}`, body);
export const setDishActive = (id: string, active: boolean) =>
  send<Dish>('PATCH', `/dishes/${id}/active`, { active });
export const setDishGroups = (id: string, optionGroupIds: string[]) =>
  send<Dish>('PUT', `/dishes/${id}/option-groups`, { optionGroupIds });

export const listOptions = (q: Query) => get<Paginated<Option>>('/options', q);
export const createOption = (body: unknown) => send<Option>('POST', '/options', body);
export const updateOption = (id: string, body: unknown) => send<Option>('PATCH', `/options/${id}`, body);
export const setOptionActive = (id: string, active: boolean) =>
  send<Option>('PATCH', `/options/${id}/active`, { active });

export const listGroups = (q: Query) => get<Paginated<OptionGroup>>('/option-groups', q);
export const getGroup = (id: string) => get<OptionGroup>(`/option-groups/${id}`);
export const createGroup = (body: unknown) => send<OptionGroup>('POST', '/option-groups', body);
export const updateGroup = (id: string, body: unknown) => send<OptionGroup>('PATCH', `/option-groups/${id}`, body);
export const setGroupOptions = (id: string, optionIds: string[]) =>
  send<OptionGroup>('PUT', `/option-groups/${id}/options`, {
    options: optionIds.map((optionId, displayOrder) => ({ optionId, displayOrder })),
  });

export const listRefs = (kind: RefKind, q?: Query) => get<RefItem[]>(`/reference/${kind}`, q);
export const createRef = (kind: RefKind, body: { code: string; name: string; sortOrder?: number }) =>
  send<RefItem>('POST', `/reference/${kind}`, body);
export const updateRef = (kind: RefKind, id: string, body: { name?: string; active?: boolean }) =>
  send<RefItem>('PATCH', `/reference/${kind}/${id}`, body);
