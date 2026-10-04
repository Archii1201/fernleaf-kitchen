'use client';

import { useCallback, useState } from 'react';
import {
  createRef as apiCreateRef,
  listRefs,
  updateRef as apiUpdateRef,
  type RefItem,
  type RefKind,
} from '../../lib/api/catalogue';
import { useAuth } from '../../lib/auth-context';
import { useAction, useLoad } from '../../lib/use-load';
import { Badge } from '../../components/ui/Badge';
import { Button, LinkButton } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState, ErrorState, Feedback } from '../../components/ui/EmptyState';
import { Icon, type IconName } from '../../components/ui/Icon';
import { Input, SearchInput } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader, Toolbar } from '../../components/ui/PageHeader';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { Table, type Column } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';

interface RefTabMeta {
  kind: RefKind;
  label: string;
  singular: string;
  icon: IconName;
  description: string;
}

const REF_TABS: RefTabMeta[] = [
  {
    kind: 'kitchen-stations',
    label: 'Kitchen Stations',
    singular: 'Station',
    icon: 'kitchen',
    description: 'Workstations responsible for preparing specific dishes (e.g. Curry, Tandoor, Bakery).',
  },
  {
    kind: 'dietary-tags',
    label: 'Dietary Tags',
    singular: 'Dietary Tag',
    icon: 'leaf',
    description: 'Dietary indicators for employee food preferences (e.g. Vegetarian, Vegan, Jain).',
  },
  {
    kind: 'allergens',
    label: 'Allergens',
    singular: 'Allergen',
    icon: 'alert',
    description: 'Mandatory allergen declarations for safety (e.g. Nuts, Dairy, Gluten).',
  },
  {
    kind: 'portion-sizes',
    label: 'Portion Sizes',
    singular: 'Portion Size',
    icon: 'catalogue',
    description: 'Serving portion measurements (e.g. Regular, Large, 250ml).',
  },
  {
    kind: 'packaging-types',
    label: 'Packaging Types',
    singular: 'Packaging Type',
    icon: 'orders',
    description: 'Container specifications for kitchen packaging and delivery logistics.',
  },
];

export default function CataloguePage() {
  const { can } = useAuth();
  const canEdit = can('catalogue.manage');

  const [activeTab, setActiveTab] = useState<RefKind>('kitchen-stations');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RefItem | null>(null);

  // Form states
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formSortOrder, setFormSortOrder] = useState<string>('');

  const currentTabMeta = REF_TABS.find((t) => t.kind === activeTab) ?? REF_TABS[0];

  const { data: refs, loading, error, reload } = useLoad<RefItem[]>(
    () => listRefs(activeTab),
    [activeTab],
  );

  const action = useAction();
  const toggleAction = useAction();

  const openCreateModal = () => {
    setEditingItem(null);
    setFormCode('');
    setFormName('');
    setFormSortOrder('');
    action.setError(null);
    setModalOpen(true);
  };

  const openEditModal = (item: RefItem) => {
    setEditingItem(item);
    setFormCode(item.code);
    setFormName(item.name);
    setFormSortOrder(item.sortOrder !== undefined ? String(item.sortOrder) : '');
    action.setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      const res = await action.run(
        () =>
          apiUpdateRef(activeTab, editingItem.id, {
            name: formName.trim(),
          }),
        `Updated ${currentTabMeta.singular.toLowerCase()} successfully`,
      );
      if (res) {
        setModalOpen(false);
        reload();
      }
    } else {
      const sortOrderNum = formSortOrder.trim() ? parseInt(formSortOrder, 10) : undefined;
      const res = await action.run(
        () =>
          apiCreateRef(activeTab, {
            code: formCode.trim().toUpperCase(),
            name: formName.trim(),
            sortOrder: isNaN(sortOrderNum as number) ? undefined : sortOrderNum,
          }),
        `Created ${currentTabMeta.singular.toLowerCase()} successfully`,
      );
      if (res) {
        setModalOpen(false);
        reload();
      }
    }
  };

  const handleToggleActive = useCallback(
    async (item: RefItem) => {
      const newActive = item.active === false ? true : false;
      const res = await toggleAction.run(
        () => apiUpdateRef(activeTab, item.id, { active: newActive }),
        `${item.name} is now ${newActive ? 'active' : 'inactive'}`,
      );
      if (res) {
        reload();
      }
    },
    [activeTab, toggleAction, reload],
  );

  const filteredItems = (refs ?? []).filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q);
  });

  const columns: Column<RefItem>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-[var(--navy)]">
          {row.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => <span className="font-medium text-[var(--navy)]">{row.name}</span>,
    },
    {
      key: 'sortOrder',
      header: 'Order',
      hideBelow: 'sm',
      render: (row) => (
        <span className="text-xs text-[var(--muted)]">
          {row.sortOrder !== undefined ? row.sortOrder : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.active === false ? 'muted' : 'success'} dot>
          {row.active === false ? 'Inactive' : 'Active'}
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
                variant={row.active === false ? 'navy' : 'subtle'}
                size="sm"
                busy={toggleAction.busy}
                onClick={() => handleToggleActive(row)}
              >
                {row.active === false ? 'Activate' : 'Deactivate'}
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalogue"
        title="Catalogue Overview"
        description="Centralized food production catalogue. Manage master dish recipes, customizable options, modifier groups, and operational reference data."
      />

      {/* Quick Navigation Cards */}
      <section aria-labelledby="quick-nav-title">
        <h2 id="quick-nav-title" className="sr-only">
          Quick Catalogue Navigation
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          <Card hover className="flex flex-col justify-between">
            <div>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--orange-soft)] text-[var(--orange-deep)]">
                <Icon name="catalogue" className="h-5 w-5" />
              </div>
              <h3 className="serif text-2xl font-semibold text-[var(--navy)]">Dishes</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Manage master recipe catalogue, preparation stations, holding temperatures, cost
                paise, and allergens.
              </p>
            </div>
            <div className="mt-6">
              <LinkButton href="/catalogue/dishes" variant="navy" size="sm" className="w-full">
                View Dishes
              </LinkButton>
            </div>
          </Card>

          <Card hover className="flex flex-col justify-between">
            <div>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--cream-soft)] text-[var(--navy)]">
                <Icon name="plus" className="h-5 w-5" />
              </div>
              <h3 className="serif text-2xl font-semibold text-[var(--navy)]">Options</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Individual customizable choices, sides, gravies, and extras available for selection in
                customer orders.
              </p>
            </div>
            <div className="mt-6">
              <LinkButton href="/catalogue/options" variant="ghost" size="sm" className="w-full">
                Manage Options
              </LinkButton>
            </div>
          </Card>

          <Card hover className="flex flex-col justify-between">
            <div>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--cream-soft)] text-[var(--navy)]">
                <Icon name="menu" className="h-5 w-5" />
              </div>
              <h3 className="serif text-2xl font-semibold text-[var(--navy)]">Option Groups</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Groupings of choices (e.g. Choose Protein, Dressing) mapped to dishes with selection
                limits and rules.
              </p>
            </div>
            <div className="mt-6">
              <LinkButton href="/catalogue/groups" variant="ghost" size="sm" className="w-full">
                Configure Groups
              </LinkButton>
            </div>
          </Card>
        </div>
      </section>

      {/* Reference Data Section */}
      <section className="space-y-4">
        <Card>
          <CardHeader
            eyebrow="Taxonomy & Metadata"
            title="Reference Data"
            action={
              canEdit ? (
                <Button variant="primary" icon="plus" onClick={openCreateModal}>
                  Add {currentTabMeta.singular}
                </Button>
              ) : null
            }
          />
          <p className="mb-6 max-w-3xl text-sm text-[var(--muted)]">
            Reference items are shared across dishes and menu configurations. Modifying active status
            preserves historical order accuracy while updating future availability.
          </p>

          <Tabs
            tabs={REF_TABS.map((tab) => ({
              value: tab.kind,
              label: tab.label,
            }))}
            value={activeTab}
            onChange={(val) => {
              setActiveTab(val);
              setSearch('');
            }}
            label="Reference Data Categories"
          />

          <div className="mb-4">
            <Toolbar>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={`Search ${currentTabMeta.label.toLowerCase()}…`}
                label={`Search ${currentTabMeta.label}`}
              />
            </Toolbar>
          </div>

          <Feedback error={toggleAction.error} notice={toggleAction.notice} />

          {loading ? (
            <SkeletonRows rows={4} />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={currentTabMeta.icon}
              title={`No ${currentTabMeta.label.toLowerCase()} found`}
              hint={
                search
                  ? `No items match the search query "${search}".`
                  : `Get started by adding your first ${currentTabMeta.singular.toLowerCase()}.`
              }
              action={
                canEdit ? (
                  <Button variant="primary" icon="plus" size="sm" onClick={openCreateModal}>
                    Add {currentTabMeta.singular}
                  </Button>
                ) : null
              }
            />
          ) : (
            <Table
              columns={columns}
              rows={filteredItems}
              rowKey={(row) => row.id}
              caption={`${currentTabMeta.label} reference list`}
            />
          )}
        </Card>
      </section>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        title={editingItem ? `Edit ${currentTabMeta.singular}` : `New ${currentTabMeta.singular}`}
        onClose={() => setModalOpen(false)}
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
              {editingItem ? 'Save Changes' : `Create ${currentTabMeta.singular}`}
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <Feedback error={action.error} />
          <Input
            label="Code"
            hint="Unique identifier code (e.g. VEG, HOT, CURRY). Capitalized."
            value={formCode}
            onChange={(e) => setFormCode(e.target.value)}
            disabled={!!editingItem}
            required
            autoFocus={!editingItem}
          />
          <Input
            label="Display Name"
            hint="Human-readable label shown throughout the kitchen admin and tickets."
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
            autoFocus={!!editingItem}
          />
          {!editingItem ? (
            <Input
              label="Sort Order"
              type="number"
              hint="Optional sequence index for display ordering."
              value={formSortOrder}
              onChange={(e) => setFormSortOrder(e.target.value)}
            />
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
