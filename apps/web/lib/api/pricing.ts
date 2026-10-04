import { get, send, type Paginated } from './client';

export const STRATEGIES = ['EXPLICIT', 'COST_MULTIPLIER', 'BASE_MARKUP'] as const;

export interface PriceTier {
  id: string;
  code: string;
  name: string;
  strategy: (typeof STRATEGIES)[number];
  markupBasisPoints: number | null;
  baseTierId: string | null;
  baseTierName: string | null;
  isDefault: boolean;
  active: boolean;
  rule: string;
  chain: string[];
}

export interface TierPriceRow {
  itemType: 'dish' | 'option';
  itemId: string;
  reference: string;
  name: string;
  costCents: number;
  derivedPriceCents: number | null;
  overrideCents: number | null;
  effectivePriceCents: number | null;
  source: 'EXPLICIT' | 'DERIVED' | null;
  missing: boolean;
  missingReason: string | null;
  resolvedFromTierId: string | null;
}

export interface PriceChange {
  itemType: 'dish' | 'option';
  itemId: string;
  priceCents: number | null;
}

export const listTiers = () => get<PriceTier[]>('/price-tiers');
export const createTier = (body: unknown) => send<PriceTier>('POST', '/price-tiers', body);
export const updateTier = (id: string, body: unknown) => send<PriceTier>('PATCH', `/price-tiers/${id}`, body);
export const makeTierDefault = (id: string) => send<PriceTier>('POST', `/price-tiers/${id}/make-default`);
export const priceGrid = (
  id: string,
  q: { type: 'dish' | 'option'; page: number; limit: number; q?: string; missingOnly?: boolean },
) => get<Paginated<TierPriceRow>>(`/price-tiers/${id}/prices`, { ...q, missingOnly: q.missingOnly || undefined });
export const savePrices = (id: string, prices: PriceChange[]) =>
  send<{ updated: number; cleared: number }>('PUT', `/price-tiers/${id}/prices`, { prices });
