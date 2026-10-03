import type { DishTemperature } from '../../catalogue/dishes/dish.dto.js';

export interface BuiltOption {
  optionId: string;
  optionGroupId: string;
  optionGroupName: string;
  optionName: string;
  optionPriceCents: number;
}

export interface BuiltCombination {
  quantity: number;
  signature: string;
  unitPriceCents: number;
  optionsPriceCents: number;
  totalCents: number;
  options: BuiltOption[];
}

export interface BuiltLine {
  dishId: string;
  categoryId: string;
  dishName: string;
  dishSku: string;
  dishDescription: string | null;
  dishTemperature: DishTemperature;
  kitchenStationId: string;
  kitchenStationCode: string;
  kitchenStationName: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  notes: string | null;
  combinations: BuiltCombination[];
}

export interface BuiltDelivery {
  companyId: string;
  companyName: string;
  customerEmployeeId: string;
  employeeName: string;
  employeeEmail: string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryAddressId: string;
  deliveryAddressLabel: string;
  deliveryAddressLine1: string;
  deliveryAddressLine2: string | null;
  deliveryAddressCity: string;
  deliveryAddressState: string | null;
  deliveryAddressPostalCode: string;
  deliveryAddressCountry: string;
  packagingTypeId: string | null;
  packagingTypeName: string | null;
  leaveKitchenMinutes: number;
  defaultDriverStaffId: string | null;
}

export interface BuiltOrder {
  delivery: BuiltDelivery;
  priceTierId: string;
  priceTierName: string;
  customerNotes: string | null;
  lines: BuiltLine[];
  subtotalCents: number;
  totalCents: number;
}

export interface ExistingCombinationView {
  key: string;
  dishId: string;
  signature: string;
  quantity: number;
  combinationId: string;
  lineId: string;
  prepStatus: 'PENDING' | 'IN_PROGRESS' | 'READY' | 'CANCELLED';
}

export type LineDiffKind =
  | 'UNCHANGED'
  | 'NEW'
  | 'CHANGED'
  | 'REMOVED';

export interface LineDiffEntry {
  kind: LineDiffKind;
  key: string;
  incoming?: BuiltCombination & { dishId: string };
  existing?: ExistingCombinationView;
}
