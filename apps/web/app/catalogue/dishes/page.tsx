'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import {
  createDish,
  listDishes,
  listGroups,
  listRefs,
  setDishActive,
  setDishGroups,
  updateDish,
  TEMPERATURES,
  type Dish,
  type DishInput,
} from '../../../lib/api/catalogue';
import { uploadFile } from '../../../lib/api/files';
import { useAuth } from '../../../lib/auth-context';
import { centsToRupeesInput, rupeesToCents } from '../../../lib/format';
import { useAction, useLoad } from '../../../lib/use-load';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { DishCard } from '../../../components/ui/DishCard';
import { DishImage } from '../../../components/ui/DishImage';
import { EmptyState, ErrorState, Feedback } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { Checkbox, Input, SearchInput, Textarea } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { PageHeader, Toolbar } from '../../../components/ui/PageHeader';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { SkeletonGrid } from '../../../components/ui/Skeleton';

const PAGE_SIZE = 12;

export default function DishesPage() {
  const { can } = useAuth();
 const canEdit = can('catalogue.manage');

  // Filters & Pagination
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stationFilter, setStationFilter] = useState('');
  const [tempFilter, setTempFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Load Reference Data
  const { data: stations } = useLoad(() => listRefs('kitchen-stations'), []);
  const { data: portionSizes } = useLoad(() => listRefs('portion-sizes'), []);
  const { data: dietaryTags } = useLoad(() => listRefs('dietary-tags'), []);
  const { data: allergens } = useLoad(() => listRefs('allergens'), []);
  const { data: allGroupsData } = useLoad(() => listGroups({ limit: 100 }), []);

  // Dish list query
  const dishQuery = {
    page,
    limit: PAGE_SIZE,
    q: search.trim() || undefined,
    stationId: stationFilter || undefined,
    temperature: tempFilter || undefined,
    active: activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined,
  };

  const {
    data: dishResult,
    loading,
    error,
    reload,
  } = useLoad(() => listDishes(dishQuery), [
    page,
    search,
    stationFilter,
    tempFilter,
    activeFilter,
  ]);

  // Actions
  const dishAction = useAction();
  const toggleAction = useAction();
  const groupsAction = useAction();
  const uploadAction = useAction();

  // Create / Edit Modal State
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCostRupees, setFormCostRupees] = useState('');
  const [formTemperature, setFormTemperature] = useState<string>('HOT');
  const [formStationId, setFormStationId] = useState<string>('');
  const [formPortionSizeId, setFormPortionSizeId] = useState<string>('');
  const [formMoq, setFormMoq] = useState<string>('');
  const [formImageFileId, setFormImageFileId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedAllergenIds, setSelectedAllergenIds] = useState<string[]>([]);
  const [formCostError, setFormCostError] = useState<string | null>(null);

  // Manage Groups Modal State
  const [groupsModalOpen, setGroupsModalOpen] = useState(false);
  const [selectedDishForGroups, setSelectedDishForGroups] = useState<Dish | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // Open Dish Modal (Create or Edit)
  const openCreateDishModal = () => {
    setEditingDish(null);
    setFormName('');
    setFormSku('');
    setFormDescription('');
    setFormCostRupees('');
    setFormTemperature('HOT');
    setFormStationId(stations && stations.length > 0 ? stations[0].id : '');
    setFormPortionSizeId('');
    setFormMoq('');
    setFormImageFileId(null);
    setSelectedTagIds([]);
    setSelectedAllergenIds([]);
    setFormCostError(null);
    dishAction.setError(null);
    setDishModalOpen(true);
  };

  const openEditDishModal = (dish: Dish) => {
    setEditingDish(dish);
    setFormName(dish.name);
    setFormSku(dish.sku);
    setFormDescription(dish.description ?? '');
    setFormCostRupees(centsToRupeesInput(dish.costCents));
    setFormTemperature(dish.temperature);
    setFormStationId(dish.kitchenStation?.id ?? '');
    setFormPortionSizeId(dish.portionSize?.id ?? '');
    setFormMoq(dish.minimumOrderQuantity !== null ? String(dish.minimumOrderQuantity) : '');
    setFormImageFileId(dish.imageFileId);
    setSelectedTagIds(dish.dietaryTags?.map((t) => t.id) ?? []);
    setSelectedAllergenIds(dish.allergens?.map((a) => a.id) ?? []);
    setFormCostError(null);
    dishAction.setError(null);
    setDishModalOpen(true);
  };

  // Open Manage Groups Modal
  const openManageGroupsModal = (dish: Dish) => {
    setSelectedDishForGroups(dish);
    setSelectedGroupIds(dish.optionGroups?.map((g) => g.id) ?? []);
    groupsAction.setError(null);
    setGroupsModalOpen(true);
  };

  // Image file handler
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const res = await uploadAction.run(
      () => uploadFile(file),
      'Image uploaded successfully',
    );
    if (res?.id) {
      setFormImageFileId(res.id);
    }
  };

  // Save Dish
  const handleSaveDish = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormCostError(null);

    const costCents = rupeesToCents(formCostRupees);
    if (costCents === undefined || costCents < 0) {
      setFormCostError('Please enter a valid rupee amount (e.g. 150.00)');
      return;
    }

    if (!formStationId) {
      dishAction.setError('A kitchen station must be selected.');
      return;
    }

    const moqNumber = formMoq.trim() ? parseInt(formMoq, 10) : undefined;

    const payload: DishInput = {
      name: formName.trim(),
      sku: formSku.trim().toUpperCase(),
      description: formDescription.trim() || undefined,
      costCents,
      temperature: formTemperature,
      kitchenStationId: formStationId,
      portionSizeId: formPortionSizeId || undefined,
      imageFileId: formImageFileId || undefined,
      minimumOrderQuantity: isNaN(moqNumber as number) ? undefined : moqNumber,
      dietaryTagIds: selectedTagIds,
      allergenIds: selectedAllergenIds,
    };

    if (editingDish) {
      const res = await dishAction.run(
        () => updateDish(editingDish.id, payload),
        `Dish "${payload.name}" updated successfully`,
      );
      if (res) {
        setDishModalOpen(false);
        reload();
      }
    } else {
      const res = await dishAction.run(
        () => createDish(payload),
        `Dish "${payload.name}" created successfully`,
      );
      if (res) {
        setDishModalOpen(false);
        reload();
      }
    }
  };

  // Save Option Groups assignment
  const handleSaveGroups = async () => {
    if (!selectedDishForGroups) return;
    const res = await groupsAction.run(
      () => setDishGroups(selectedDishForGroups.id, selectedGroupIds),
      `Updated option groups for "${selectedDishForGroups.name}"`,
    );
    if (res) {
      setGroupsModalOpen(false);
      reload();
    }
  };

  // Toggle active status
  const handleToggleActive = useCallback(
    async (dish: Dish) => {
      const nextActive = !dish.active;
      const res = await toggleAction.run(
        () => setDishActive(dish.id, nextActive),
        `Dish "${dish.name}" is now ${nextActive ? 'active' : 'inactive'}`,
      );
      if (res) {
        reload();
      }
    },
    [toggleAction, reload],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Dishes"
        description="Master dish recipes, operational specifications, prep stations, holding temperatures, and allergen tags."
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
              <Button variant="primary" icon="plus" onClick={openCreateDishModal}>
                Add Dish
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <Card className="!p-4">
        <Toolbar>
          <div className="flex-1 min-w-[220px]">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search dishes by name or SKU…"
              label="Search dishes"
            />
          </div>

          <div className="w-44">
            <Select
              label=""
              value={stationFilter}
              onChange={(e) => {
                setStationFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by kitchen station"
            >
              <option value="">All Stations</option>
              {(stations ?? []).map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-36">
            <Select
              label=""
              value={tempFilter}
              onChange={(e) => {
                setTempFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by temperature"
            >
              <option value="">All Temps</option>
              {TEMPERATURES.map((temp) => (
                <option key={temp} value={temp}>
                  {temp}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-36">
            <Select
              label=""
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value as 'all' | 'active' | 'inactive');
                setPage(1);
              }}
              aria-label="Filter by status"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </Select>
          </div>
        </Toolbar>
      </Card>

      <Feedback error={toggleAction.error} notice={toggleAction.notice} />

      {/* Dishes Grid */}
      {loading ? (
        <SkeletonGrid count={8} className="h-72" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !dishResult?.data || dishResult.data.length === 0 ? (
        <EmptyState
          icon="catalogue"
          title="No dishes found"
          hint={
            search || stationFilter || tempFilter || activeFilter !== 'all'
              ? 'No dishes match the applied filters. Try adjusting your search criteria.'
              : 'Your dish catalogue is currently empty. Add your first recipe to get started.'
          }
          action={
            canEdit ? (
              <Button variant="primary" icon="plus" size="sm" onClick={openCreateDishModal}>
                Add Dish
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {dishResult.data.map((dish) => (
              <DishCard
                key={dish.id}
                dish={dish}
                onEdit={canEdit ? openEditDishModal : undefined}
                onToggleActive={canEdit ? handleToggleActive : undefined}
                onManageGroups={canEdit ? openManageGroupsModal : undefined}
                toggling={toggleAction.busy}
              />
            ))}
          </div>

          <Pagination
            page={dishResult.meta.page}
            totalPages={dishResult.meta.totalPages}
            total={dishResult.meta.total}
            onPage={setPage}
          />
        </>
      )}

      {/* Create / Edit Dish Modal */}
      <Modal
        open={dishModalOpen}
        title={editingDish ? `Edit "${editingDish.name}"` : 'New Dish Recipe'}
        onClose={() => setDishModalOpen(false)}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDishModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={dishAction.busy}
              onClick={(e) => void handleSaveDish(e)}
            >
              {editingDish ? 'Save Changes' : 'Create Dish'}
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => void handleSaveDish(e)} className="space-y-4">
          <Feedback error={dishAction.error || formCostError} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Dish Name"
              placeholder="e.g. Paneer Butter Masala"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              autoFocus
            />

            <Input
              label="SKU Code"
              placeholder="e.g. CUR-PAN-01"
              value={formSku}
              onChange={(e) => setFormSku(e.target.value)}
              required
              hint="Unique kitchen tracking identifier"
            />
          </div>

          <Textarea
            label="Description"
            placeholder="Culinary description, preparation notes or serving style…"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            hint="Optional description for menus and packaging"
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Base Cost (₹)"
              placeholder="120.00"
              value={formCostRupees}
              onChange={(e) => setFormCostRupees(e.target.value)}
              required
              hint="Unit cost in INR (stored as paise)"
            />

            <Select
              label="Holding Temperature"
              value={formTemperature}
              onChange={(e) => setFormTemperature(e.target.value)}
              required
            >
              {TEMPERATURES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>

            <Select
              label="Kitchen Station"
              value={formStationId}
              onChange={(e) => setFormStationId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select station…
              </option>
              {(stations ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Portion Size"
              value={formPortionSizeId}
              onChange={(e) => setFormPortionSizeId(e.target.value)}
              hint="Optional serving portion measurement"
            >
              <option value="">None / Standard</option>
              {(portionSizes ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>

            <Input
              label="Minimum Order Quantity"
              type="number"
              min="1"
              placeholder="1"
              value={formMoq}
              onChange={(e) => setFormMoq(e.target.value)}
              hint="Optional minimum batch count"
            />
          </div>

          {/* Image Upload */}
          <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-4">
            <label className="block text-sm font-semibold text-[var(--navy)]">Dish Photo</label>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Upload a high quality image for dish presentation.
            </p>

            <div className="mt-3 flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)]">
                <DishImage imageFileId={formImageFileId} className="h-full w-full" />
              </div>

              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleFileUpload(e)}
                  disabled={uploadAction.busy}
                  className="block w-full text-xs text-[var(--muted)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--navy)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-[var(--navy-dark)]"
                />
                {uploadAction.busy ? (
                  <p className="mt-1 text-xs text-[var(--orange-deep)]">Uploading photo…</p>
                ) : null}
                {uploadAction.notice ? (
                  <p className="mt-1 text-xs text-[var(--success)]">{uploadAction.notice}</p>
                ) : null}
                {uploadAction.error ? (
                  <p className="mt-1 text-xs text-[var(--danger)]">{uploadAction.error}</p>
                ) : null}
              </div>

              {formImageFileId ? (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => setFormImageFileId(null)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>

          {/* Dietary Tags Checkboxes */}
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

          {/* Allergens Checkboxes */}
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

      {/* Manage Option Groups Assignment Modal */}
      <Modal
        open={groupsModalOpen}
        title={`Option Groups · ${selectedDishForGroups?.name ?? ''}`}
        onClose={() => setGroupsModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setGroupsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={groupsAction.busy}
              onClick={() => void handleSaveGroups()}
            >
              Save Group Links
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            Select modifier option groups that customers can choose when ordering this dish.
          </p>

          <Feedback error={groupsAction.error} />

          {!allGroupsData?.data || allGroupsData.data.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--muted)]">
              No option groups defined yet.{' '}
              <Link href="/catalogue/groups" className="text-[var(--orange-deep)] underline">
                Create option groups first
              </Link>
              .
            </p>
          ) : (
            <div className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)]">
              {allGroupsData.data.map((group) => {
                const checked = selectedGroupIds.includes(group.id);
                return (
                  <label
                    key={group.id}
                    className="flex cursor-pointer items-start justify-between p-3 transition-colors hover:bg-[var(--cream-soft)]"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedGroupIds([...selectedGroupIds, group.id]);
                          } else {
                            setSelectedGroupIds(selectedGroupIds.filter((id) => id !== group.id));
                          }
                        }}
                        className="mt-0.5 h-4 w-4 rounded accent-[var(--orange-deep)]"
                      />
                      <div>
                        <p className="font-medium text-[var(--navy)]">{group.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          Code: {group.code} · {group.required ? 'Required selection' : 'Optional'}
                          {group.maxSelections ? ` · Max ${group.maxSelections}` : ' · Unlimited'}
                        </p>
                      </div>
                    </div>
                    <Badge tone={group.required ? 'orange' : 'muted'}>
                      {group.required ? 'Required' : 'Optional'}
                    </Badge>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
