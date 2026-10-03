'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPriceGrid,
  fetchPriceTiers,
  formatCents,
  makeTierDefault,
  parseDollarsToCents,
  saveTierPrices,
  type Paginated,
  type PriceTier,
  type TierPriceRow,
} from '../../lib/pricing-api';

const PAGE_SIZE = 20;

/** Draft value per row id: a dollars string the operator is typing. */
type Drafts = Record<string, string>;

const cell: React.CSSProperties = {
  borderBottom: '1px solid #eee',
  padding: '0.5rem 0.6rem',
  textAlign: 'left',
  verticalAlign: 'middle',
};

export default function PricingAdmin() {
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [tierId, setTierId] = useState<string>('');
  const [itemType, setItemType] = useState<'dish' | 'option'>('dish');
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [grid, setGrid] = useState<Paginated<TierPriceRow> | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedTier = useMemo(
    () => tiers.find((tier) => tier.id === tierId) ?? null,
    [tiers, tierId],
  );

  const loadTiers = useCallback(async () => {
    try {
      const loaded = await fetchPriceTiers();

      setTiers(loaded);
      setTierId((current) => current || (loaded[0]?.id ?? ''));
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }, []);

  const loadGrid = useCallback(async () => {
    if (!tierId) {
      return;
    }

    setBusy(true);

    try {
      setGrid(
        await fetchPriceGrid(tierId, {
          type: itemType,
          page,
          limit: PAGE_SIZE,
          q: search || undefined,
          missingOnly,
        }),
      );
      setError(null);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setBusy(false);
    }
  }, [tierId, itemType, page, search, missingOnly]);

  useEffect(() => {
    void loadTiers();
  }, [loadTiers]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  // A new filter always restarts at page 1; otherwise an empty page appears.
  useEffect(() => {
    setPage(1);
    setDrafts({});
  }, [tierId, itemType, search, missingOnly]);

  const pendingCount = Object.keys(drafts).length;

  async function onSave() {
    const prices: {
      itemType: 'dish' | 'option';
      itemId: string;
      priceCents: number | null;
    }[] = [];

    for (const [itemId, raw] of Object.entries(drafts)) {
      const parsed = parseDollarsToCents(raw);

      if (parsed === undefined) {
        setError(`"${raw}" is not a valid price. Use digits, e.g. 12.50.`);

        return;
      }

      prices.push({ itemType, itemId, priceCents: parsed });
    }

    setBusy(true);

    try {
      const result = await saveTierPrices(tierId, prices);

      setDrafts({});
      setStatus(
        `Saved ${result.updated} override(s), cleared ${result.cleared}.`,
      );
      setError(null);
      await loadGrid();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onMakeDefault() {
    if (!tierId) {
      return;
    }

    setBusy(true);

    try {
      await makeTierDefault(tierId);
      await loadTiers();
      setStatus('Default tier updated.');
    } catch (defaultError) {
      setError((defaultError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: '1.05rem' }}>Tiers</h2>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.4rem' }}>
        {tiers.map((tier) => (
          <li key={tier.id}>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
              <input
                type="radio"
                name="tier"
                checked={tier.id === tierId}
                onChange={() => setTierId(tier.id)}
              />
              <strong>{tier.name}</strong>
              <span style={{ color: '#666' }}>{tier.rule}</span>
              {tier.isDefault ? <Badge tone="#0b6">default</Badge> : null}
              {tier.active ? null : <Badge tone="#999">inactive</Badge>}
            </label>
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', margin: '1rem 0' }}>
        <select
          value={itemType}
          onChange={(event) =>
            setItemType(event.target.value as 'dish' | 'option')
          }
        >
          <option value="dish">Dishes</option>
          <option value="option">Options</option>
        </select>

        <input
          type="search"
          placeholder="Search name or code"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={(event) => setMissingOnly(event.target.checked)}
          />
          Missing prices only
        </label>

        <button type="button" onClick={onMakeDefault} disabled={busy || !selectedTier || selectedTier.isDefault}>
          Make default
        </button>

        <button type="button" onClick={onSave} disabled={busy || pendingCount === 0}>
          Save {pendingCount || ''} change{pendingCount === 1 ? '' : 's'}
        </button>
      </div>

      {error ? <p style={{ color: '#b00' }}>{error}</p> : null}
      {status ? <p style={{ color: '#0a6' }}>{status}</p> : null}

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={cell}>Item</th>
            <th style={cell}>Cost</th>
            <th style={cell}>Derived</th>
            <th style={cell}>Effective</th>
            <th style={cell}>Price override</th>
            <th style={cell} />
          </tr>
        </thead>
        <tbody>
          {(grid?.data ?? []).map((row) => {
            const draft = drafts[row.itemId];
            const value =
              draft ??
              (row.overrideCents === null
                ? ''
                : (row.overrideCents / 100).toFixed(2));

            return (
              <tr key={row.itemId}>
                <td style={cell}>
                  <div>{row.name}</div>
                  <small style={{ color: '#777' }}>{row.reference}</small>
                </td>
                <td style={cell}>{formatCents(row.costCents)}</td>
                <td style={cell}>{formatCents(row.derivedPriceCents)}</td>
                <td style={cell}>
                  {row.missing ? (
                    <Badge tone="#b00">missing</Badge>
                  ) : (
                    <>
                      {formatCents(row.effectivePriceCents)}{' '}
                      {row.source === 'EXPLICIT' ? (
                        <Badge tone="#06c">overridden</Badge>
                      ) : null}
                    </>
                  )}
                </td>
                <td style={cell}>
                  <input
                    inputMode="decimal"
                    placeholder="derived"
                    value={value}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [row.itemId]: event.target.value,
                      }))
                    }
                    style={{ width: '7rem' }}
                  />
                </td>
                <td style={cell}>
                  <button
                    type="button"
                    // An empty draft clears the override on save, which is
                    // exactly what "reset to derived" means.
                    onClick={() =>
                      setDrafts((current) => ({ ...current, [row.itemId]: '' }))
                    }
                    disabled={row.overrideCents === null && draft === undefined}
                  >
                    Reset
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {grid ? (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.75rem' }}>
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={busy || page <= 1}>
            Previous
          </button>
          <span>
            Page {grid.meta.page} of {Math.max(1, grid.meta.totalPages)} ({grid.meta.total} rows)
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={busy || page >= grid.meta.totalPages}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        background: tone,
        color: '#fff',
        borderRadius: '999px',
        fontSize: '0.7rem',
        padding: '0.1rem 0.5rem',
      }}
    >
      {children}
    </span>
  );
}
