'use client';

import { useMemo, useState } from 'react';
import {
  STRATEGIES,
  createTier,
  listTiers,
  makeTierDefault,
  priceGrid,
  savePrices,
  updateTier,
  type PriceTier,
  type TierPriceRow,
} from '../../lib/api/pricing';
import { useAuth } from '../../lib/auth-context';
import { centsToRupeesInput, rupees, rupeesToCents } from '../../lib/format';
import { useAction, useLoad } from '../../lib/use-load';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState, ErrorState, Feedback } from '../../components/ui/EmptyState';
import { Checkbox, Input, SearchInput } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader, Toolbar } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { Skeleton, SkeletonRows } from '../../components/ui/Skeleton';
import { Table, type Column } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';

export default function PricingPage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const canManage = can('pricing.manage');

  // Load tiers
  const {
    data: tiers,
    loading: tiersLoading,
    error: tiersError,
    reload: reloadTiers,
  } = useLoad(listTiers, []);

  // Selected Tier
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);

  const selectedTier = useMemo(() => {
    if (!tiers || tiers.length === 0) return null;
    if (selectedTierId) {
      const found = tiers.find((t) => t.id === selectedTierId);
      if (found) return found;
    }
    const defaultTier = tiers.find((t) => t.isDefault);
    return defaultTier ?? tiers[0];
  }, [tiers, selectedTierId]);

  // Price Grid State
  const [itemType, setItemType] = useState<'dish' | 'option'>('dish');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);

  // Load Grid Rows
  const {
    data: gridData,
    loading: gridLoading,
    error: gridError,
    reload: reloadGrid,
  } = useLoad(
    () => {
      if (!selectedTier) {
        return Promise.resolve({
          data: [] as TierPriceRow[],
          meta: { page: 1, limit: 15, total: 0, totalPages: 1 },
        });
      }
      return priceGrid(selectedTier.id, {
        type: itemType,
        page,
        limit: 15,
        q: search.trim() || undefined,
        missingOnly: missingOnly || undefined,
      });
    },
    [selectedTier?.id, itemType, page, search, missingOnly],
  );

  // Tier Mutation Actions
  const { run: runTierAction, busy: tierActionBusy, error: tierActionError } = useAction();

  // Price Override Modal State
  const [editingRow, setEditingRow] = useState<TierPriceRow | null>(null);
  const [overrideInput, setOverrideInput] = useState('');
  const { run: runSavePrice, busy: savePriceBusy, error: savePriceError } = useAction();

  // Tier Modals State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const handleMakeDefault = async (tier: PriceTier) => {
    if (tier.isDefault) return;
    const ok = window.confirm(`Make "${tier.name}" the default price tier across all companies?`);
    if (!ok) return;

    await runTierAction(async () => {
      await makeTierDefault(tier.id);
      toast(`"${tier.name}" is now the default price tier.`, 'success');
      reloadTiers();
    });
  };

  const handleOpenEditPrice = (row: TierPriceRow) => {
    setEditingRow(row);
    setOverrideInput(centsToRupeesInput(row.overrideCents));
  };

  const handleSavePriceOverride = async (clear = false) => {
    if (!selectedTier || !editingRow) return;

    let priceCents: number | null = null;
    if (!clear) {
      const parsed = rupeesToCents(overrideInput);
      if (parsed === undefined) {
        toast('Please enter a valid rupee amount (e.g. 150 or 150.50).', 'warning');
        return;
      }
      priceCents = parsed;
    }

    await runSavePrice(async () => {
      await savePrices(selectedTier.id, [
        {
          itemType: editingRow.itemType,
          itemId: editingRow.itemId,
          priceCents,
        },
      ]);
      toast(
        clear
          ? `Cleared override for ${editingRow.name}. Reverted to derived price.`
          : `Saved override of ${rupees(priceCents)} for ${editingRow.name}.`,
        'success',
      );
      setEditingRow(null);
      reloadGrid();
    });
  };

  // Grid Columns
  const columns: Column<TierPriceRow>[] = [
    {
      key: 'item',
      header: 'Item Name',
      render: (row) => (
        <div>
          <p className="font-semibold text-[var(--navy)]">{row.name}</p>
          <p className="font-mono text-xs text-[var(--muted)]">{row.reference}</p>
        </div>
      ),
    },
    {
      key: 'cost',
      header: 'Cost',
      render: (row) => <span className="text-[var(--muted)]">{rupees(row.costCents)}</span>,
    },
    {
      key: 'derived',
      header: 'Derived Price',
      render: (row) => (
        <span>{row.derivedPriceCents !== null ? rupees(row.derivedPriceCents) : '—'}</span>
      ),
    },
    {
      key: 'override',
      header: 'Override',
      render: (row) =>
        row.overrideCents !== null ? (
          <Badge tone="orange">{rupees(row.overrideCents)}</Badge>
        ) : (
          <span className="text-xs text-[var(--muted)]">None</span>
        ),
    },
    {
      key: 'effective',
      header: 'Effective Price',
      render: (row) =>
        row.missing ? (
          <Badge tone="danger" dot>
            Missing ⚠
          </Badge>
        ) : (
          <span className="font-semibold text-[var(--navy)]">
            {rupees(row.effectivePriceCents)}
          </span>
        ),
    },
    {
      key: 'source',
      header: 'Source',
      hideBelow: 'sm',
      render: (row) => {
        if (row.missing) {
          return <span className="text-xs text-[var(--muted)]">—</span>;
        }
        return row.source === 'EXPLICIT' ? (
          <Badge tone="navy">Explicit</Badge>
        ) : (
          <Badge tone="orange">Derived</Badge>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      hideBelow: 'md',
      render: (row) =>
        row.missing ? (
          <span
            className="text-xs font-semibold text-[var(--danger)]"
            title={row.missingReason ?? 'Missing price'}
          >
            ⚠ {row.missingReason ?? 'Missing'}
          </span>
        ) : (
          <Badge tone="success" dot>
            Active
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) =>
        canManage ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEditPrice(row);
            }}
          >
            {row.overrideCents !== null ? 'Edit Override' : 'Set Override'}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing"
        eyebrow="Catalogue & Tiers"
        description="Manage price tiers, markup derivation strategies, and item overrides for client accounts."
        actions={
          canManage ? (
            <Button icon="plus" onClick={() => setIsCreateOpen(true)}>
              New Price Tier
            </Button>
          ) : null
        }
      />

      <Feedback error={tierActionError} />

      {/* Tier Selector Section */}
      <Card>
        <CardHeader
          eyebrow="Price Tiers"
          title="Select Workspace Tier"
          action={
            selectedTier && canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                {!selectedTier.isDefault ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    busy={tierActionBusy}
                    onClick={() => handleMakeDefault(selectedTier)}
                  >
                    Make Default
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => setIsEditOpen(true)}>
                  Edit Tier Rule
                </Button>
              </div>
            ) : null
          }
        />

        {tiersLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : tiersError ? (
          <ErrorState message={tiersError} onRetry={reloadTiers} />
        ) : !tiers || tiers.length === 0 ? (
          <EmptyState
            title="No price tiers configured"
            hint="Create a base standard price tier to start setting up prices."
            icon="pricing"
            action={
              canManage ? (
                <Button icon="plus" onClick={() => setIsCreateOpen(true)}>
                  Create Standard Tier
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((tier) => {
              const isSelected = selectedTier?.id === tier.id;
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => {
                    setSelectedTierId(tier.id);
                    setPage(1);
                  }}
                  className={`relative flex flex-col items-start rounded-[var(--radius)] border p-4 text-left transition-[border-color,box-shadow,transform] duration-150 ${
                    isSelected
                      ? 'border-[var(--orange-deep)] bg-[var(--ivory)] shadow-[0_4px_12px_rgba(229,139,32,0.12)]'
                      : 'border-[var(--border)] bg-white hover:border-[var(--orange)]'
                  }`}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <p className="serif text-lg font-semibold text-[var(--navy)]">{tier.name}</p>
                    {tier.isDefault ? (
                      <Badge tone="orange" dot>
                        Default
                      </Badge>
                    ) : null}
                  </div>
                  <p className="font-mono text-xs font-semibold tracking-wider text-[var(--muted)]">
                    {tier.code}
                  </p>
                  <div className="mt-2 text-xs text-[var(--muted)]">
                    <span className="font-medium text-[var(--navy)]">{tier.rule}</span>
                  </div>
                  {!tier.active ? (
                    <span className="mt-2">
                      <Badge tone="muted">Inactive</Badge>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        {selectedTier ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--navy)]">Active Rule:</span>
              <span className="rounded bg-[var(--cream-soft)] px-2 py-0.5 font-medium text-[var(--navy)]">
                {selectedTier.rule}
              </span>
              <span>• Strategy: {selectedTier.strategy}</span>
              {selectedTier.baseTierName ? <span>• Base: {selectedTier.baseTierName}</span> : null}
            </div>
            {selectedTier.chain && selectedTier.chain.length > 1 ? (
              <div>Resolution Chain depth: {selectedTier.chain.length}</div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {/* Pricing Grid Card */}
      {selectedTier ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <Tabs
              label="Item type toggle"
              value={itemType}
              onChange={(val) => {
                setItemType(val);
                setPage(1);
              }}
              tabs={[
                { value: 'dish', label: 'Dishes' },
                { value: 'option', label: 'Options & Add-ons' },
              ]}
            />

            <Toolbar>
              <SearchInput
                label="Search items"
                placeholder={`Search ${itemType === 'dish' ? 'dishes' : 'options'}…`}
                value={search}
                onChange={(val) => {
                  setSearch(val);
                  setPage(1);
                }}
              />
              <div className="flex items-center pt-2 sm:pt-0">
                <Checkbox
                  label={
                    <span className="flex items-center gap-1 font-medium text-[var(--navy)]">
                      <span>Missing pricing only</span>
                      <span className="text-[var(--danger)]">⚠</span>
                    </span>
                  }
                  checked={missingOnly}
                  onChange={(e) => {
                    setMissingOnly(e.target.checked);
                    setPage(1);
                  }}
                />
              </div>
            </Toolbar>
          </div>

          <Feedback error={gridError} />

          {gridLoading ? (
            <SkeletonRows rows={8} />
          ) : !gridData || gridData.data.length === 0 ? (
            <EmptyState
              title={`No ${itemType === 'dish' ? 'dishes' : 'options'} found`}
              hint={
                missingOnly
                  ? `There are no missing prices for this tier under current filters!`
                  : search
                    ? `No matching items found for "${search}".`
                    : `No items available in the catalogue.`
              }
              icon="pricing"
              action={
                missingOnly ? (
                  <Button variant="ghost" size="sm" onClick={() => setMissingOnly(false)}>
                    Clear Missing Filter
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table
                columns={columns}
                rows={gridData.data}
                rowKey={(row) => `${row.itemType}-${row.itemId}`}
                caption={`Pricing grid for ${selectedTier.name}`}
              />

              <Pagination
                page={gridData.meta.page}
                totalPages={gridData.meta.totalPages}
                total={gridData.meta.total}
                onPage={(p) => setPage(p)}
              />
            </>
          )}
        </Card>
      ) : null}

      {/* Edit Price Override Modal */}
      {editingRow ? (
        <Modal
          open={Boolean(editingRow)}
          title={`Price Override: ${editingRow.name}`}
          onClose={() => setEditingRow(null)}
          footer={
            <div className="flex w-full items-center justify-between">
              <div>
                {editingRow.overrideCents !== null ? (
                  <Button
                    variant="danger"
                    size="sm"
                    busy={savePriceBusy}
                    onClick={() => handleSavePriceOverride(true)}
                  >
                    Clear Override
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingRow(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  busy={savePriceBusy}
                  onClick={() => handleSavePriceOverride(false)}
                >
                  Save Override
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <Feedback error={savePriceError} />

            <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[var(--muted)]">Reference: </span>
                  <span className="font-mono font-medium text-[var(--navy)]">
                    {editingRow.reference}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Item Cost: </span>
                  <span className="font-medium text-[var(--navy)]">
                    {rupees(editingRow.costCents)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Derived Formula Price: </span>
                  <span className="font-medium text-[var(--navy)]">
                    {rupees(editingRow.derivedPriceCents)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Current Effective: </span>
                  <span className="font-semibold text-[var(--navy)]">
                    {editingRow.missing ? (
                      <span className="text-[var(--danger)]">Missing ⚠</span>
                    ) : (
                      rupees(editingRow.effectivePriceCents)
                    )}
                  </span>
                </div>
              </div>
            </div>

            <Input
              label="Override Price (₹)"
              hint="Enter amount in Rupees (e.g. 195 or 195.50). Overrides the derivation formula for this specific item in this tier."
              placeholder="e.g. 199.00"
              value={overrideInput}
              onChange={(e) => setOverrideInput(e.target.value)}
              autoFocus
            />

            <p className="text-xs text-[var(--muted)]">
              Tip: Click &quot;Clear Override&quot; to remove any explicit tier pricing and revert to the
              tier&apos;s formula derivation.
            </p>
          </div>
        </Modal>
      ) : null}

      {/* Create Tier Modal */}
      {isCreateOpen ? (
        <CreateTierModal
          open={isCreateOpen}
          existingTiers={tiers ?? []}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={(newTier) => {
            setIsCreateOpen(false);
            toast(`Created price tier "${newTier.name}".`, 'success');
            reloadTiers();
            setSelectedTierId(newTier.id);
          }}
        />
      ) : null}

      {/* Edit Tier Modal */}
      {isEditOpen && selectedTier ? (
        <EditTierModal
          open={isEditOpen}
          tier={selectedTier}
          existingTiers={tiers ?? []}
          onClose={() => setIsEditOpen(false)}
          onSuccess={(updated) => {
            setIsEditOpen(false);
            toast(`Updated price tier "${updated.name}".`, 'success');
            reloadTiers();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateTierModal({
  open,
  existingTiers,
  onClose,
  onSuccess,
}: {
  open: boolean;
  existingTiers: PriceTier[];
  onClose: () => void;
  onSuccess: (tier: PriceTier) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState<(typeof STRATEGIES)[number]>('EXPLICIT');
  const [basisPoints, setBasisPoints] = useState('');
  const [baseTierId, setBaseTierId] = useState('');
  const { run, busy, error } = useAction();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const payload: Record<string, unknown> = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        strategy,
      };

      if (strategy === 'COST_MULTIPLIER' || strategy === 'BASE_MARKUP') {
        const bp = Number.parseInt(basisPoints, 10);
        if (Number.isNaN(bp) || bp < 0) {
          throw new Error('Please enter a valid basis points number (e.g. 1500 for +15%).');
        }
        payload.markupBasisPoints = bp;
      }

      if (strategy === 'BASE_MARKUP') {
        if (!baseTierId) {
          throw new Error('Please select a base tier to derive prices from.');
        }
        payload.baseTierId = baseTierId;
      }

      const created = await createTier(payload);
      onSuccess(created);
    });
  };

  return (
    <Modal
      open={open}
      title="Create Price Tier"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" busy={busy} onClick={handleSubmit}>
            Create Tier
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Feedback error={error} />
        <Input
          label="Tier Code"
          placeholder="e.g. ENTERPRISE"
          hint="Unique uppercase identifier."
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
        />
        <Input
          label="Tier Name"
          placeholder="e.g. Enterprise Client Pricing"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Select
          label="Pricing Strategy"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as (typeof STRATEGIES)[number])}
        >
          <option value="EXPLICIT">EXPLICIT (Only explicitly set prices)</option>
          <option value="COST_MULTIPLIER">COST_MULTIPLIER (Derived from cost x factor)</option>
          <option value="BASE_MARKUP">BASE_MARKUP (Derived from base tier + markup)</option>
        </Select>

        {strategy === 'COST_MULTIPLIER' ? (
          <Input
            label="Multiplier Basis Points"
            placeholder="e.g. 24000 for 2.4x cost"
            hint="10,000 basis points = 1.0x. E.g. 24000 = cost x 2.4."
            type="number"
            value={basisPoints}
            onChange={(e) => setBasisPoints(e.target.value)}
            required
          />
        ) : null}

        {strategy === 'BASE_MARKUP' ? (
          <>
            <Select
              label="Base Tier"
              hint="The parent tier from which prices are calculated."
              value={baseTierId}
              onChange={(e) => setBaseTierId(e.target.value)}
              required
            >
              <option value="">Select a base tier…</option>
              {existingTiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </Select>

            <Input
              label="Markup Basis Points"
              placeholder="e.g. 1500 for +15%"
              hint="1,000 basis points = 10%. E.g. 1500 = base tier price + 15%."
              type="number"
              value={basisPoints}
              onChange={(e) => setBasisPoints(e.target.value)}
              required
            />
          </>
        ) : null}
      </form>
    </Modal>
  );
}

function EditTierModal({
  open,
  tier,
  existingTiers,
  onClose,
  onSuccess,
}: {
  open: boolean;
  tier: PriceTier;
  existingTiers: PriceTier[];
  onClose: () => void;
  onSuccess: (tier: PriceTier) => void;
}) {
  const [name, setName] = useState(tier.name);
  const [strategy, setStrategy] = useState<(typeof STRATEGIES)[number]>(tier.strategy);
  const [basisPoints, setBasisPoints] = useState(
    tier.markupBasisPoints !== null ? String(tier.markupBasisPoints) : '',
  );
  const [baseTierId, setBaseTierId] = useState(tier.baseTierId ?? '');
  const [active, setActive] = useState(tier.active);
  const { run, busy, error } = useAction();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        strategy,
        active,
      };

      if (strategy === 'COST_MULTIPLIER' || strategy === 'BASE_MARKUP') {
        const bp = Number.parseInt(basisPoints, 10);
        if (Number.isNaN(bp) || bp < 0) {
          throw new Error('Please enter a valid basis points number.');
        }
        payload.markupBasisPoints = bp;
      } else {
        payload.markupBasisPoints = null;
      }

      if (strategy === 'BASE_MARKUP') {
        if (!baseTierId) {
          throw new Error('Please select a base tier.');
        }
        payload.baseTierId = baseTierId;
      } else {
        payload.baseTierId = null;
      }

      const updated = await updateTier(tier.id, payload);
      onSuccess(updated);
    });
  };

  return (
    <Modal
      open={open}
      title={`Edit Tier: ${tier.name}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" busy={busy} onClick={handleSubmit}>
            Save Changes
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Feedback error={error} />
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Tier Code
          </span>
          <p className="font-mono text-sm font-semibold text-[var(--navy)]">{tier.code}</p>
        </div>
        <Input
          label="Tier Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Select
          label="Pricing Strategy"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as (typeof STRATEGIES)[number])}
        >
          <option value="EXPLICIT">EXPLICIT (Only explicitly set prices)</option>
          <option value="COST_MULTIPLIER">COST_MULTIPLIER (Derived from cost x factor)</option>
          <option value="BASE_MARKUP">BASE_MARKUP (Derived from base tier + markup)</option>
        </Select>

        {strategy === 'COST_MULTIPLIER' ? (
          <Input
            label="Multiplier Basis Points"
            hint="10,000 basis points = 1.0x. E.g. 24000 = cost x 2.4."
            type="number"
            value={basisPoints}
            onChange={(e) => setBasisPoints(e.target.value)}
            required
          />
        ) : null}

        {strategy === 'BASE_MARKUP' ? (
          <>
            <Select
              label="Base Tier"
              value={baseTierId}
              onChange={(e) => setBaseTierId(e.target.value)}
              required
            >
              <option value="">Select a base tier…</option>
              {existingTiers
                .filter((t) => t.id !== tier.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
            </Select>

            <Input
              label="Markup Basis Points"
              hint="1,000 basis points = 10%. E.g. 1500 = base + 15%."
              type="number"
              value={basisPoints}
              onChange={(e) => setBasisPoints(e.target.value)}
              required
            />
          </>
        ) : null}

        <div className="pt-2">
          <Checkbox
            label="Active (available for company assignment)"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
        </div>
      </form>
    </Modal>
  );
}
