'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import {
  createOption,
  listOptions,
  listRefs,
  setOptionActive,
  updateOption,
  type Option,
} from '../../../lib/api/catalogue';
import { useAuth } from '../../../lib/auth-context';
import { centsToRupeesInput, rupees, rupeesToCents } from '../../../lib/format';
import { useAction, useLoad } from '../../../lib/use-load';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, ErrorState, Feedback } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { Checkbox, Input, SearchInput, Textarea } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { PageHeader, Toolbar } from '../../../components/ui/PageHeader';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { Table, type Column } from '../../../components/ui/Table';

const PAGE_SIZE = 15;

export default function OptionsPage() {
  const { can } = useAuth();
  const canEdit = can('catalogue.manage');

  // Filters & Pagination
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Reference data
  const { data: dietaryTags } = useLoad(() => listRefs('dietary-tags'), []);
  const { data: allergens } = useLoad(() => listRefs('allergens'), []);
  const { data: portionSizes } = useLoad(() => listRefs('portion-sizes'), []);

  // Options query
  const query = {
    page,
    limit: PAGE_SIZE,
    q: search.trim() || undefined,
    active: activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined,
  };

  const {
    data: optionsResult,
    loading,
    error,
    reload,
  } = useLoad(() => listOptions(query), [page, search, activeFilter]);

  // Actions
  const action = useAction();
  const toggleAction = useAction();

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<Option | null>(null);

  // Form Fields
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCostRupees, setFormCostRupees] = useState('');
  const [formPortionSizeId, setFormPortionSizeId] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedAllergenIds, setSelectedAllergenIds] = useState<string[]>([]);
  const [costError, setCostError] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingOption(null);
    setFormCode('');
    setFormName('');
    setFormDescription('');
    setFormCostRupees('0.00');
    setFormPortionSizeId('');
    setSelectedTagIds([]);
    setSelectedAllergenIds([]);
    setCostError(null);
    action.setError(null);
    setModalOpen(true);
  };

  const openEditModal = (opt: Option) => {
    setEditingOption(opt);
    setFormCode(opt.code);
    setFormName(opt.name);
    setFormDescription(opt.description ?? '');
    setFormCostRupees(centsToRupeesInput(opt.costCents));
    setFormPortionSizeId(opt.portionSize?.id ?? '');
    setSelectedTagIds(opt.dietaryTags?.map((t) => t.id) ?? []);
    setSelectedAllergenIds(opt.allergens?.map((a) => a.id) ?? []);
    setCostError(null);
    action.setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setCostError(null);

    const costCents = rupeesToCents(formCostRupees);
    if (costCents === undefined || costCents < 0) {
      setCostError('Please enter a valid rupee amount (e.g. 20.00 or 0 for free)');
      return;
    }

    const payload = {
  name: formName.trim(),
  description: formDescription.trim() || undefined,
  costCents,
  portionSizeId: formPortionSizeId || undefined,
  dietaryTagIds: selectedTagIds,
  allergenIds: selectedAllergenIds,
};

if (editingOption) {
  const res = await action.run(
    () => updateOption(editingOption.id, payload),
    `Option "${payload.name}" updated successfully`,
  );

  if (res) {
    setModalOpen(false);
    reload();
  }
} else {
  const res = await action.run(
    () =>
      createOption({
        code: formCode.trim().toUpperCase(),
        ...payload,
      }),
    `Option "${payload.name}" created successfully`,
  );

  if (res) {
    setModalOpen(false);
    reload();
  }
}

    if (editingOption) {
      const res = await action.run(
        () => updateOption(editingOption.id, payload),
        `Option "${payload.name}" updated successfully`,
      );
      if (res) {
        setModalOpen(false);
        reload();
      }
    } else {
      const res = await action.run(
        () => createOption(payload),
        `Option "${payload.name}" created successfully`,
      );
      if (res) {
        setModalOpen(false);
        reload();
      }
    }
  };

  const handleToggleActive = useCallback(
    async (opt: Option) => {
      const nextActive = !opt.active;
      const res = await toggleAction.run(
        () => setOptionActive(opt.id, nextActive),
        `Option "${opt.name}" is now ${nextActive ? 'active' : 'inactive'}`,
      );
      if (res) {
        reload();
      }
    },
    [toggleAction, reload],
  );

  const columns: Column<Option>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-[var(--navy)]">{row.code}</span>
      ),
    },
    {
      key: 'name',
      header: 'Option Name',
      render: (row) => (
        <div>
          <p className="font-medium text-[var(--navy)]">{row.name}</p>
          {row.description ? (
            <p className="mt-0.5 text-xs text-[var(--muted)] line-clamp-1">{row.description}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'cost',
      header: 'Cost',
      render: (row) => (
        <span className="font-medium text-[var(--navy)]">{rupees(row.costCents)}</span>
      ),
    },
    {
      key: 'tags',
      header: 'Tags & Allergens',
      hideBelow: 'md',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          {row.dietaryTags?.map((t) => (
            <span
              key={t.id}
              className="rounded bg-[var(--cream-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--navy)]"
            >
              {t.name}
            </span>
          ))}
          {row.allergens?.length > 0 ? (
            <span className="text-[11px] text-[var(--danger)]">
              Allergens: {row.allergens.map((a) => a.name).join(', ')}
            </span>
          ) : null}
          {!row.dietaryTags?.length && !row.allergens?.length ? (
            <span className="text-xs text-[var(--muted)]">—</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.active ? 'success' : 'muted'} dot>
          {row.active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) => (
        <div className="flex justify-end gap-2">
          {canEdit ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => openEditModal(row)}>
                Edit
              </Button>
              <Button
                variant={row.active ? 'ghost' : 'navy'}
                size="sm"
                busy={toggleAction.busy}
                onClick={() => handleToggleActive(row)}
              >
                {row.active ? 'Deactivate' : 'Activate'}
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Customizable Options"
        description="Individual modifier choices, sides, bread varieties, gravies, and extras that can be added to option groups."
        actions={
          <div className="flex gap-2">
            <Link
              href="/catalogue"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--navy)] hover:border-[var(--orange)]"
            >
              <Icon name="chevronLeft" className="h-4 w-4" />
              Overview
            </Link>
            {canEdit ? (
              <Button variant="primary" icon="plus" onClick={openCreateModal}>
                Add Option
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="!p-4">
        <Toolbar>
          <div className="flex-1 min-w-[220px]">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search options by code or name…"
              label="Search options"
            />
          </div>

          <div className="w-40">
            <Select
              label=""
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value as 'all' | 'active' | 'inactive');
                setPage(1);
              }}
              aria-label="Filter options by status"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </Select>
          </div>
        </Toolbar>
      </Card>

      <Feedback error={toggleAction.error} notice={toggleAction.notice} />

      {loading ? (
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !optionsResult?.data || optionsResult.data.length === 0 ? (
        <EmptyState
          icon="plus"
          title="No options found"
          hint={
            search || activeFilter !== 'all'
              ? 'No modifier options match your search criteria.'
              : 'You haven’t configured any options yet. Add your first option to get started.'
          }
          action={
            canEdit ? (
              <Button variant="primary" icon="plus" size="sm" onClick={openCreateModal}>
                Add Option
              </Button>
            ) : null
          }
        />
      ) : (
        <Card className="!p-0">
          <Table
            columns={columns}
            rows={optionsResult.data}
            rowKey={(row) => row.id}
            caption="Customizable food options list"
          />
          <div className="p-4 border-t border-[var(--border)]">
            <Pagination
              page={optionsResult.meta.page}
              totalPages={optionsResult.meta.totalPages}
              total={optionsResult.meta.total}
              onPage={setPage}
            />
          </div>
        </Card>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        title={editingOption ? `Edit Option "${editingOption.name}"` : 'New Modifier Option'}
        onClose={() => setModalOpen(false)}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={action.busy}
              onClick={(e) => void handleSave(e)}
            >
              {editingOption ? 'Save Changes' : 'Create Option'}
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <Feedback error={action.error || costError} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
  label="Option Code"
  disabled={!!editingOption}
              placeholder="e.g. OPT-ROTI-BUTTER"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
              required
              hint="Unique tracking code (uppercase)"
              autoFocus={!editingOption}
            />

            <Input
              label="Display Name"
              placeholder="e.g. Butter Roti"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              autoFocus={!!editingOption}
            />
          </div>

          <Textarea
            label="Description"
            placeholder="Details, ingredients, or preparation notes…"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Cost (₹)"
              placeholder="0.00"
              value={formCostRupees}
              onChange={(e) => setFormCostRupees(e.target.value)}
              required
              hint="Unit cost in rupees (enter 0 for complimentary items)"
            />

            <Select
              label="Portion Size"
              value={formPortionSizeId}
              onChange={(e) => setFormPortionSizeId(e.target.value)}
            >
              <option value="">None / Standard</option>
              {(portionSizes ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Dietary tags */}
          {dietaryTags && dietaryTags.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-[var(--navy)]">Dietary Tags</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {dietaryTags.map((tag) => {
                  const checked = selectedTagIds.includes(tag.id);
                  return (
                    <Checkbox
                      key={tag.id}
                      label={tag.name}
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTagIds([...selectedTagIds, tag.id]);
                        } else {
                          setSelectedTagIds(selectedTagIds.filter((id) => id !== tag.id));
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Allergens */}
          {allergens && allergens.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-[var(--navy)]">Allergen Declarations</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {allergens.map((allergen) => {
                  const checked = selectedAllergenIds.includes(allergen.id);
                  return (
                    <Checkbox
                      key={allergen.id}
                      label={allergen.name}
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAllergenIds([...selectedAllergenIds, allergen.id]);
                        } else {
                          setSelectedAllergenIds(
                            selectedAllergenIds.filter((id) => id !== allergen.id),
                          );
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
