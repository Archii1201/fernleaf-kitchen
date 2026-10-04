'use client';

import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Checkbox } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { PageHeader } from '../../components/ui/PageHeader';
import { SkeletonGrid, SkeletonRows } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState, Feedback } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { DishCard } from '../../components/food/DishCard';
import {
  listCategories,
  createCategory,
  updateCategory,
  reorderCategories,
  replaceCategoryDishes,
  updateCategoryDish,
  previewMenu,
  type MenuCategoryAdmin,
  type MenuPreview,
} from '../../lib/api/menu';
import { listCompanies } from '../../lib/api/companies';
import { listEmployees, type Employee } from '../../lib/api/employees';
import { listDishes } from '../../lib/api/catalogue';
import { useAuth } from '../../lib/auth-context';
import { useLoad, useAction } from '../../lib/use-load';

type ViewMode = 'admin' | 'preview';

export default function MenuPage() {
  const { can } = useAuth();
  const canEdit = can('menu.manage');
  const action = useAction();

  const [mode, setMode] = useState<ViewMode>('admin');

  // Admin Categories Data
  const {
    data: categories,
    loading: categoriesLoading,
    error: categoriesError,
    reload: reloadCategories,
  } = useLoad(listCategories, ['menu-categories']);

  // Catalogue Dishes for Dish Assign Modal
  const { data: allDishesData } = useLoad(() => listDishes({ limit: 100 }), ['all-dishes']);
  const allDishes = allDishesData?.data ?? [];

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategorySlug, setNewCategorySlug] = useState('');
  const [newCategoryIsSecret, setNewCategoryIsSecret] = useState(false);

  const [editCategory, setEditCategory] = useState<MenuCategoryAdmin | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editIsSecret, setEditIsSecret] = useState(false);
  const [editActive, setEditActive] = useState(true);

  const [assignDishesCategory, setAssignDishesCategory] = useState<MenuCategoryAdmin | null>(null);
  const [selectedDishIds, setSelectedDishIds] = useState<string[]>([]);

  // Preview Mode State
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  // Companies & Employees for Preview selector
  const { data: companiesData } = useLoad(() => listCompanies({ limit: 100 }), ['preview-companies']);
  const companies = companiesData?.data ?? [];

  const { data: employeesData } = useLoad(
    () =>
      selectedCompanyId
        ? listEmployees({ companyId: selectedCompanyId, limit: 100 })
        : Promise.resolve({ data: [] as Employee[], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }),
    ['preview-employees', selectedCompanyId],
  );
  const employees = employeesData?.data ?? [];

  // Menu Preview loader
  const {
    data: preview,
    loading: previewLoading,
    error: previewError,
    reload: reloadPreview,
  } = useLoad(
    () =>
      selectedCompanyId
        ? previewMenu({
            companyId: selectedCompanyId,
            employeeId: selectedEmployeeId || undefined,
          })
        : Promise.resolve(null as MenuPreview | null),
    ['menu-preview', selectedCompanyId, selectedEmployeeId],
  );

  // Admin Actions: Reorder Categories
  const handleMoveCategory = async (index: number, direction: 'up' | 'down') => {
    if (!categories) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const reordered = [...categories];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    await action.run(async () => {
      await reorderCategories(reordered.map((c) => c.id));
      reloadCategories();
    }, 'Categories reordered');
  };

  // Admin Actions: Create Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || !newCategorySlug.trim()) return;

    const res = await action.run(async () => {
      await createCategory({
        name: newCategoryName.trim(),
        slug: newCategorySlug.trim().toLowerCase(),
        isSecret: newCategoryIsSecret,
        displayOrder: (categories?.length ?? 0) + 1,
      });
      reloadCategories();
    }, 'Category created successfully');

    if (res !== undefined) {
      setCreateModalOpen(false);
      setNewCategoryName('');
      setNewCategorySlug('');
      setNewCategoryIsSecret(false);
    }
  };

  // Admin Actions: Edit Category
  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCategory) return;

    const res = await action.run(async () => {
      await updateCategory(editCategory.id, {
        name: editName.trim(),
        slug: editSlug.trim().toLowerCase(),
        isSecret: editIsSecret,
        active: editActive,
      });
      reloadCategories();
    }, 'Category updated');

    if (res !== undefined) {
      setEditCategory(null);
    }
  };

  // Admin Actions: Toggle Category Active
  const handleToggleCategoryActive = async (cat: MenuCategoryAdmin) => {
    await action.run(async () => {
      await updateCategory(cat.id, { active: !cat.active });
      reloadCategories();
    }, `Category ${cat.active ? 'deactivated' : 'activated'}`);
  };

  // Admin Actions: Move Dish in Category
  const handleMoveDish = async (cat: MenuCategoryAdmin, dishIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? dishIndex - 1 : dishIndex + 1;
    if (targetIndex < 0 || targetIndex >= cat.dishes.length) return;

    const dishesList = [...cat.dishes];
    const [moved] = dishesList.splice(dishIndex, 1);
    dishesList.splice(targetIndex, 0, moved);

    await action.run(async () => {
      await replaceCategoryDishes(
        cat.id,
        dishesList.map((d) => ({ dishId: d.dishId, active: d.active })),
      );
      reloadCategories();
    }, 'Dish order updated');
  };

  // Admin Actions: Toggle Dish in Category
  const handleToggleDishActive = async (catId: string, dishId: string, currentActive: boolean) => {
    await action.run(async () => {
      await updateCategoryDish(catId, dishId, { active: !currentActive });
      reloadCategories();
    }, `Dish ${currentActive ? 'hidden from' : 'shown in'} category`);
  };

  // Admin Actions: Remove Dish from Category
  const handleRemoveDish = async (cat: MenuCategoryAdmin, dishId: string) => {
    const updated = cat.dishes.filter((d) => d.dishId !== dishId);
    await action.run(async () => {
      await replaceCategoryDishes(
        cat.id,
        updated.map((d) => ({ dishId: d.dishId, active: d.active })),
      );
      reloadCategories();
    }, 'Dish removed from category');
  };

  // Open Dish Assignment Modal
  const openAssignModal = (cat: MenuCategoryAdmin) => {
    setAssignDishesCategory(cat);
    setSelectedDishIds(cat.dishes.map((d) => d.dishId));
  };

  // Save Dish Assignment
  const handleSaveDishesToCategory = async () => {
    if (!assignDishesCategory) return;

    // Keep existing dish active states if already in category, or default true
    const existingMap = new Map(assignDishesCategory.dishes.map((d) => [d.dishId, d.active]));
    const dishesPayload = selectedDishIds.map((dishId) => ({
      dishId,
      active: existingMap.get(dishId) ?? true,
    }));

    const res = await action.run(async () => {
      await replaceCategoryDishes(assignDishesCategory.id, dishesPayload);
      reloadCategories();
    }, 'Category dishes updated');

    if (res !== undefined) {
      setAssignDishesCategory(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Food & Culinary"
        title="Menu Operations"
        description="Curate client-facing menu categories, arrange culinary sequences, configure secret availability, and preview live corporate employee menus."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={mode === 'preview' ? 'navy' : 'ghost'}
              icon="user"
              onClick={() => setMode(mode === 'preview' ? 'admin' : 'preview')}
            >
              {mode === 'preview' ? 'Exit Preview' : 'Preview as Employee'}
            </Button>
            {mode === 'admin' && canEdit ? (
              <Button
                variant="primary"
                icon="plus"
                onClick={() => {
                  setNewCategoryName('');
                  setNewCategorySlug('');
                  setNewCategoryIsSecret(false);
                  setCreateModalOpen(true);
                }}
              >
                New Category
              </Button>
            ) : null}
          </div>
        }
      />

      <Feedback error={action.error} notice={action.notice} />

      {mode === 'admin' ? (
        // ==================== ADMIN VIEW ====================
        <div className="space-y-6">
          {categoriesLoading ? (
            <SkeletonRows rows={6} />
          ) : categoriesError ? (
            <ErrorState message={categoriesError} onRetry={reloadCategories} />
          ) : !categories || categories.length === 0 ? (
            <EmptyState
              icon="menu"
              title="No menu categories created"
              hint="Get started by creating your first menu category to group dishes."
              action={
                canEdit ? (
                  <Button variant="primary" icon="plus" onClick={() => setCreateModalOpen(true)}>
                    Create First Category
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="space-y-5">
              {categories.map((cat, catIndex) => (
                <Card key={cat.id} className="transition-all duration-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1 text-[var(--muted)]">
                        <span className="serif text-lg font-semibold text-[var(--navy)]">#{catIndex + 1}</span>
                      </div>
                      <h2 className="serif text-2xl font-semibold text-[var(--navy)]">{cat.name}</h2>
                      <span className="rounded font-mono text-xs text-[var(--muted)] bg-[var(--cream-soft)] px-2 py-0.5">
                        /{cat.slug}
                      </span>
                      {cat.isSecret ? (
                        <Badge tone="warning" dot>
                          Secret Category
                        </Badge>
                      ) : null}
                      <Badge tone={cat.active ? 'success' : 'muted'} dot>
                        {cat.active ? 'Active' : 'Inactive'}
                      </Badge>
                      <span className="text-xs text-[var(--muted)]">
                        {cat.dishes.length} {cat.dishes.length === 1 ? 'dish' : 'dishes'}
                      </span>
                    </div>

                    {canEdit ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="chevronLeft"
                          disabled={catIndex === 0 || action.busy}
                          title="Move Category Up"
                          aria-label="Move category up"
                          onClick={() => handleMoveCategory(catIndex, 'up')}
                        >
                          Up
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="chevronRight"
                          disabled={catIndex === categories.length - 1 || action.busy}
                          title="Move Category Down"
                          aria-label="Move category down"
                          onClick={() => handleMoveCategory(catIndex, 'down')}
                        >
                          Down
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={action.busy}
                          onClick={() => {
                            setEditCategory(cat);
                            setEditName(cat.name);
                            setEditSlug(cat.slug);
                            setEditIsSecret(cat.isSecret);
                            setEditActive(cat.active);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={action.busy}
                          onClick={() => handleToggleCategoryActive(cat)}
                        >
                          {cat.active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          icon="plus"
                          disabled={action.busy}
                          onClick={() => openAssignModal(cat)}
                        >
                          Manage Dishes
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {/* Dishes in Category */}
                  <div className="mt-4">
                    {cat.dishes.length === 0 ? (
                      <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[var(--ivory)] py-8 text-center text-sm text-[var(--muted)]">
                        <p>No dishes assigned to this category yet.</p>
                        {canEdit ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="plus"
                            className="mt-2"
                            onClick={() => openAssignModal(cat)}
                          >
                            Assign Dishes
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border)]">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)] bg-[var(--ivory)]">
                              <th className="eyebrow px-3 py-2 text-xs">Order</th>
                              <th className="eyebrow px-3 py-2 text-xs">SKU</th>
                              <th className="eyebrow px-3 py-2 text-xs">Dish Name</th>
                              <th className="eyebrow px-3 py-2 text-xs">Catalogue</th>
                              <th className="eyebrow px-3 py-2 text-xs">In Category</th>
                              {canEdit ? <th className="eyebrow px-3 py-2 text-right text-xs">Actions</th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {cat.dishes.map((item, dishIndex) => (
                              <tr
                                key={item.dishId}
                                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--cream)]/40 transition-colors"
                              >
                                <td className="px-3 py-2.5 font-mono text-xs text-[var(--muted)]">
                                  #{dishIndex + 1}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-xs font-semibold uppercase text-[var(--navy)]">
                                  {item.dish.sku}
                                </td>
                                <td className="px-3 py-2.5 font-medium text-[var(--navy)]">
                                  {item.dish.name}
                                </td>
                                <td className="px-3 py-2.5">
                                  <Badge tone={item.dish.active ? 'success' : 'muted'}>
                                    {item.dish.active ? 'Active' : 'Archived'}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2.5">
                                  <Badge tone={item.active ? 'success' : 'danger'}>
                                    {item.active ? 'Visible' : 'Hidden'}
                                  </Badge>
                                </td>
                                {canEdit ? (
                                  <td className="px-3 py-2.5 text-right">
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={dishIndex === 0 || action.busy}
                                        onClick={() => handleMoveDish(cat, dishIndex, 'up')}
                                        className="rounded p-1 text-[var(--navy)] hover:bg-[var(--cream-soft)] disabled:opacity-30"
                                        title="Move Up"
                                        aria-label="Move dish up"
                                      >
                                        <Icon name="chevronLeft" className="h-3.5 w-3.5 rotate-90" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={dishIndex === cat.dishes.length - 1 || action.busy}
                                        onClick={() => handleMoveDish(cat, dishIndex, 'down')}
                                        className="rounded p-1 text-[var(--navy)] hover:bg-[var(--cream-soft)] disabled:opacity-30"
                                        title="Move Down"
                                        aria-label="Move dish down"
                                      >
                                        <Icon name="chevronRight" className="h-3.5 w-3.5 rotate-90" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={action.busy}
                                        onClick={() => handleToggleDishActive(cat.id, item.dishId, item.active)}
                                        className="rounded px-2 py-0.5 text-xs font-semibold text-[var(--navy)] hover:bg-[var(--cream-soft)]"
                                      >
                                        {item.active ? 'Hide' : 'Show'}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={action.busy}
                                        onClick={() => handleRemoveDish(cat, item.dishId)}
                                        className="rounded p-1 text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                                        title="Remove from category"
                                        aria-label="Remove dish from category"
                                      >
                                        <Icon name="close" className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        // ==================== PREVIEW AS EMPLOYEE VIEW ====================
        <div className="space-y-6">
          <Card className="bg-[var(--ivory)] border-[var(--border)]">
            <CardHeader
              eyebrow="Digital Experience Simulation"
              title="Employee Menu Preview"
              action={
                <Button variant="ghost" size="sm" onClick={reloadPreview} disabled={!selectedCompanyId || previewLoading}>
                  Refresh Preview
                </Button>
              }
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="Company"
                value={selectedCompanyId}
                onChange={(e) => {
                  setSelectedCompanyId(e.target.value);
                  setSelectedEmployeeId('');
                }}
              >
                <option value="">Select a company…</option>
                {companies.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name}
                  </option>
                ))}
              </Select>

              <Select
                label="Employee (Optional)"
                value={selectedEmployeeId}
                disabled={!selectedCompanyId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
              >
                <option value="">All Employees / Company Default</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} ({emp.email})
                  </option>
                ))}
              </Select>

              {preview ? (
                <div className="flex flex-col justify-end">
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 py-2 text-xs">
                    <p className="text-[var(--muted)]">Active Pricing Tier</p>
                    <p className="font-semibold text-[var(--navy)]">{preview.priceTier.name}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          {/* Preview Results */}
          {!selectedCompanyId ? (
            <EmptyState
              icon="companies"
              title="Select a company to preview"
              hint="Choose a client organization above to inspect the exact menu and pricing visible to their personnel."
            />
          ) : previewLoading ? (
            <SkeletonGrid count={6} className="h-64" />
          ) : previewError ? (
            <ErrorState message={previewError} onRetry={reloadPreview} />
          ) : !preview || preview.categories.length === 0 ? (
            <EmptyState
              icon="menu"
              title="No active menu categories available"
              hint="This company has no categories visible. Check company menu visibility or category active settings."
            />
          ) : (
            <div className="space-y-10">
              {/* Client Menu Branding Banner */}
              <div className="rounded-[var(--radius)] bg-[var(--navy)] p-6 text-white shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="eyebrow !text-[var(--orange)]">Corporate Menu</span>
                    <h2 className="serif text-3xl font-semibold mt-1">{preview.company.name}</h2>
                    {preview.employee ? (
                      <p className="mt-1 text-sm text-white/80">
                        Viewing as personalized attendee: <strong className="text-white">{preview.employee.fullName}</strong>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-white/70">Viewing as general corporate account</p>
                    )}
                  </div>
                  <div className="text-right">
                    <Badge tone="orange">Tier: {preview.priceTier.name}</Badge>
                    <p className="mt-1 text-xs text-white/60">
                      {preview.categories.reduce((acc, cat) => acc + cat.dishes.length, 0)} total menu dishes
                    </p>
                  </div>
                </div>
              </div>

              {/* Categories Display */}
              {preview.categories.map((category) => (
                <section key={category.id} className="space-y-4">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                    <div className="flex items-center gap-3">
                      <h3 className="serif text-2xl font-semibold text-[var(--navy)]">{category.name}</h3>
                      {category.isSecret ? (
                        <Badge tone="warning">Private Corporate Selection</Badge>
                      ) : null}
                    </div>
                    <span className="text-xs text-[var(--muted)]">
                      {category.dishes.length} items
                    </span>
                  </div>

                  {category.dishes.length === 0 ? (
                    <p className="text-sm italic text-[var(--muted)]">No dishes available in this section.</p>
                  ) : (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {category.dishes.map((dish) => (
                        <DishCard
                          key={dish.id}
                          name={dish.name}
                          sku={dish.sku}
                          description={dish.description}
                          priceCents={dish.priceCents}
                          priceLabel="Menu Price"
                          tags={dish.source === 'DERIVED' ? ['Derived Tier'] : ['Explicit Price']}
                          active={true}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CREATE CATEGORY MODAL */}
      <Modal
        open={createModalOpen}
        title="Create Menu Category"
        onClose={() => setCreateModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={action.busy}
              onClick={(e) => void handleCreateCategory(e)}
            >
              Create Category
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <Input
            label="Category Name"
            placeholder="e.g. Executive Lunches"
            value={newCategoryName}
            required
            onChange={(e) => {
              setNewCategoryName(e.target.value);
              if (!newCategorySlug) {
                setNewCategorySlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, ''),
                );
              }
            }}
          />
          <Input
            label="Category Slug"
            placeholder="e.g. executive-lunches"
            value={newCategorySlug}
            required
            onChange={(e) => setNewCategorySlug(e.target.value)}
            hint="Unique URL-friendly identifier"
          />
          <Checkbox
            label="Secret Category (Only accessible via direct assignment or specific company access)"
            checked={newCategoryIsSecret}
            onChange={(e) => setNewCategoryIsSecret(e.target.checked)}
          />
        </form>
      </Modal>

      {/* EDIT CATEGORY MODAL */}
      <Modal
        open={!!editCategory}
        title="Edit Menu Category"
        onClose={() => setEditCategory(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditCategory(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={action.busy}
              onClick={(e) => void handleUpdateCategory(e)}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleUpdateCategory} className="space-y-4">
          <Input
            label="Category Name"
            value={editName}
            required
            onChange={(e) => setEditName(e.target.value)}
          />
          <Input
            label="Category Slug"
            value={editSlug}
            required
            onChange={(e) => setEditSlug(e.target.value)}
          />
          <Checkbox
            label="Secret Category"
            checked={editIsSecret}
            onChange={(e) => setEditIsSecret(e.target.checked)}
          />
          <Checkbox
            label="Active Category (visible on menu)"
            checked={editActive}
            onChange={(e) => setEditActive(e.target.checked)}
          />
        </form>
      </Modal>

      {/* MANAGE DISHES IN CATEGORY MODAL */}
      <Modal
        open={!!assignDishesCategory}
        title={`Assign Dishes to "${assignDishesCategory?.name}"`}
        size="lg"
        onClose={() => setAssignDishesCategory(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignDishesCategory(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={action.busy}
              onClick={() => void handleSaveDishesToCategory()}
            >
              Save Category Dishes ({selectedDishIds.length})
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            Select the dishes to include in this category. You can reorder them inside the category after assigning.
          </p>
          <div className="max-h-96 space-y-2 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
            {allDishes.length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--muted)]">No dishes found in catalogue.</p>
            ) : (
              allDishes.map((dish) => {
                const isSelected = selectedDishIds.includes(dish.id);
                return (
                  <label
                    key={dish.id}
                    className={`flex items-center justify-between gap-3 rounded p-2.5 transition-colors cursor-pointer border ${
                      isSelected
                        ? 'border-[var(--orange)] bg-[var(--orange-soft)]/20'
                        : 'border-[var(--border)] bg-white hover:bg-[var(--cream)]/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDishIds((prev) => [...prev, dish.id]);
                          } else {
                            setSelectedDishIds((prev) => prev.filter((id) => id !== dish.id));
                          }
                        }}
                        className="h-4 w-4 rounded accent-[var(--orange-deep)]"
                      />
                      <div>
                        <p className="text-xs font-mono uppercase text-[var(--muted)]">{dish.sku}</p>
                        <p className="text-sm font-semibold text-[var(--navy)]">{dish.name}</p>
                      </div>
                    </div>
                    <Badge tone={dish.active ? 'navy' : 'muted'}>{dish.active ? 'Catalogue Active' : 'Inactive'}</Badge>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
