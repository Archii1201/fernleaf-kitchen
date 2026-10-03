/** Shapes mirroring the API responses this screen consumes. */
export interface PriceTier {
  id: string;
  code: string;
  name: string;
  strategy: 'EXPLICIT' | 'COST_MULTIPLIER' | 'BASE_MARKUP';
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
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface PriceGridQuery {
  type: 'dish' | 'option';
  page: number;
  limit: number;
  q?: string;
  missingOnly?: boolean;
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** The API authenticates with an httpOnly cookie, so every call sends creds. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;

    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export function fetchPriceTiers(): Promise<PriceTier[]> {
  return call<PriceTier[]>('/price-tiers');
}

export function fetchPriceGrid(
  tierId: string,
  query: PriceGridQuery,
): Promise<Paginated<TierPriceRow>> {
  const params = new URLSearchParams({
    type: query.type,
    page: String(query.page),
    limit: String(query.limit),
  });

  if (query.q) {
    params.set('q', query.q);
  }

  if (query.missingOnly) {
    params.set('missingOnly', 'true');
  }

  return call<Paginated<TierPriceRow>>(`/price-tiers/${tierId}/prices?${params}`);
}

export function saveTierPrices(
  tierId: string,
  prices: {
    itemType: 'dish' | 'option';
    itemId: string;
    priceCents: number | null;
  }[],
): Promise<{ updated: number; cleared: number }> {
  return call(`/price-tiers/${tierId}/prices`, {
    method: 'PUT',
    body: JSON.stringify({ prices }),
  });
}

export function makeTierDefault(tierId: string): Promise<PriceTier> {
  return call<PriceTier>(`/price-tiers/${tierId}/make-default`, {
    method: 'POST',
  });
}

/** Cents in, dollars out. Display only; the API always speaks integer cents. */
export function formatCents(cents: number | null): string {
  if (cents === null) {
    return '--';
  }

  return `$${Math.trunc(cents / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
}

/**
 * Parses a typed dollar amount back into integer cents. Returns null for an
 * empty field (which clears the override) and undefined for invalid input.
 */
export function parseDollarsToCents(value: string): number | null | undefined {
  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return undefined;
  }

  const [dollars, fraction = ''] = trimmed.split('.');

  return Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
}
