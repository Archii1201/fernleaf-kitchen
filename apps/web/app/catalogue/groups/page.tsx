'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  createGroup,
  listGroups,
  listOptions,
  setGroupOptions,
  updateGroup,
  type OptionGroup,
} from '../../../lib/api/catalogue';
import { useAuth } from '../../../lib/auth-context';
import { rupees } from '../../../lib/format';
import { useAction, useLoad } from '../../../lib/use-load';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, ErrorState, Feedback } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { Checkbox, Input, SearchInput } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { PageHeader, Toolbar } from '../../../components/ui/PageHeader';
import { Pagination } from '../../../components/ui/Pagination';
import { SkeletonRows } from '../../../components/ui/Skeleton';

const PAGE_SIZE = 12;

export default function OptionGroupsPage() {
  const { can } = useAuth();
  const canEdit = can('catalogue.edit') || can('catalogue.admin');

  // Filters & Pagination
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // Groups list
  const {
    data: groupsResult,
    loading,
    error,
    reload,
  } = useLoad(
    () =>
      listGroups({
        page,
        limit: PAGE_SIZE,
        q: search.trim() || undefined,
      }),
    [page, search],
  );

  // Available options for membership management
  const { data: allOptionsResult } = useLoad(() => listOptions({ limit: 100 }), []);

  // Actions
  const groupAction = useAction();
  const membershipAction = useAction();

  // Create / Edit Group Modal
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<OptionGroup | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formRequired, setFormRequired] = useState(false);
  const [formDisplayOrder, setFormDisplayOrder] = useState('0');
  const [formMaxSelections, setFormMaxSelections] = useState('');

  // Manage Group Options Membership Modal
  const [membershipModalOpen, setMembershipModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<OptionGroup | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [optionSearch, setOptionSearch] = useState('');

  // Open Create Modal
  const openCreateModal = () => {
    setEditingGroup(null);
    setFormCode('');
    setFormName('');
    setFormRequired(false);
    setFormDisplayOrder('0');
    setFormMaxSelections('');
    groupAction.setError(null);
    setGroupModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (group: OptionGroup) => {
    setEditingGroup(group);
    setFormCode(group.code);
    setFormName(group.name);
    setFormRequired(group.required);
    setFormDisplayOrder(String(group.displayOrder ?? 0));
    setFormMaxSelections(group.maxSelections !== null ? String(group.maxSelections) : '');
    groupAction.setError(null);
    setGroupModalOpen(true);
  };

  // Open Membership Modal
  const openMembershipModal = (group: OptionGroup) => {
    setSelectedGroup(group);
    // Maintain existing ordered option IDs
    const orderedIds = (group.options ?? []).map((o) => o.id);
    setSelectedOptionIds(orderedIds);
    setOptionSearch('');
    membershipAction.setError(null);
    setMembershipModalOpen(true);
  };

  // Save Group (Create / Update)
  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();

    const maxSel = formMaxSelections.trim() ? parseInt(formMaxSelections, 10) : null;
    const dispOrder = formDisplayOrder.trim() ? parseInt(formDisplayOrder, 10) : 0;

    const payload = {
      code: formCode.trim().toUpperCase(),
      name: formName.trim(),
      required: formRequired,
      displayOrder: isNaN(dispOrder) ? 0 : dispOrder,
      maxSelections: maxSel !== null && !isNaN(maxSel) ? maxSel : null,
    };

    if (editingGroup) {
      const res = await groupAction.run(
        () => updateGroup(editingGroup.id, payload),
        `Group "${payload.name}" updated successfully`,
      );
      if (res) {
        setGroupModalOpen(false);
        reload();
      }
    } else {
      const res = await groupAction.run(
        () => createGroup(payload),
        `Group "${payload.name}" created successfully`,
      );
      if (res) {
        setGroupModalOpen(false);
        reload();
      }
    }
  };

  // Reorder options in membership modal
  const moveOption = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= selectedOptionIds.length) return;
    const next = [...selectedOptionIds];
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    setSelectedOptionIds(next);
  };

  const toggleOptionMembership = (id: string) => {
    if (selectedOptionIds.includes(id)) {
      setSelectedOptionIds(selectedOptionIds.filter((item) => item !== id));
    } else {
      setSelectedOptionIds([...selectedOptionIds, id]);
    }
  };

  // Save Group Options Membership
  const handleSaveMembership = async () => {
    if (!selectedGroup) return;

    const res = await membershipAction.run(
      () => setGroupOptions(selectedGroup.id, selectedOptionIds),
      `Updated member options for "${selectedGroup.name}"`,
    );
    if (res) {
      setMembershipModalOpen(false);
      reload();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Option Groups"
        description="Configure modifier groupings (e.g. Choose Protein, Select Rice, Toppings), selection constraints, and member options."
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
                Add Option Group
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="!p-4">
        <Toolbar>
          <div className="flex-1 min-w-[240px]">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search option groups by name or code…"
              label="Search option groups"
            />
          </div>
        </Toolbar>
      </Card>

      <Feedback error={groupAction.error} notice={groupAction.notice} />

      {loading ? (
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !groupsResult?.data || groupsResult.data.length === 0 ? (
        <EmptyState
          icon="menu"
          title="No option groups found"
          hint={
            search
              ? 'No option groups match your search criteria.'
              : 'Create modifier groups to attach customizable options to your dish recipes.'
          }
          action={
            canEdit ? (
              <Button variant="primary" icon="plus" size="sm" onClick={openCreateModal}>
                Add Option Group
              </Button>
            ) : null}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4">
            {groupsResult.data.map((group) => {
              const options = group.options ?? [];

              return (
                <Card key={group.id} className="transition-all hover:border-[var(--border)]">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[var(--muted)]">
                          {group.code}
                        </span>
                        <h3 className="serif text-2xl font-semibold text-[var(--navy)]">
                          {group.name}
                        </h3>
                        <Badge tone={group.required ? 'orange' : 'navy'}>
                          {group.required ? 'Required' : 'Optional'}
                        </Badge>
                        <Badge tone="muted">
                          {group.maxSelections
                            ? `Max ${group.maxSelections} ${group.maxSelections === 1 ? 'choice' : 'choices'}`
                            : 'Unlimited choices'}
                        </Badge>
                      </div>

                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Display Order: {group.displayOrder} · {options.length} option
                        {options.length === 1 ? '' : 's'} assigned
                      </p>

                      {/* Chips of assigned options */}
                      {options.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {options.map((opt) => (
                            <span
                              key={opt.id}
                              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--ivory)] px-2.5 py-1 text-xs text-[var(--navy)]"
                            >
                              <span className="font-medium">{opt.name}</span>
                              <span className="text-[11px] text-[var(--muted)]">
                                ({rupees(opt.costCents)})
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs italic text-[var(--muted)]">
                          No options attached to this group yet.
                        </p>
                      )}
                    </div>

                    {canEdit ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openMembershipModal(group)}
                        >
                          Manage Options ({options.length})
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={() => openEditModal(group)}
                        >
                          Edit Group
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>

          <Pagination
            page={groupsResult.meta.page}
            totalPages={groupsResult.meta.totalPages}
            total={groupsResult.meta.total}
            onPage={setPage}
          />
        </div>
      )}

      {/* Create / Edit Group Modal */}
      <Modal
        open={groupModalOpen}
        title={editingGroup ? `Edit Group "${editingGroup.name}"` : 'New Option Group'}
        onClose={() => setGroupModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setGroupModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={groupAction.busy}
              onClick={(e) => void handleSaveGroup(e)}
            >
              {editingGroup ? 'Save Changes' : 'Create Group'}
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => void handleSaveGroup(e)} className="space-y-4">
          <Feedback error={groupAction.error} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Group Code"
              placeholder="e.g. GRP-BREAD-CHOICE"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
              required
              hint="Uppercase unique code"
              autoFocus={!editingGroup}
            />

            <Input
              label="Group Name"
              placeholder="e.g. Choose Your Bread"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              autoFocus={!!editingGroup}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Display Order"
              type="number"
              min="0"
              value={formDisplayOrder}
              onChange={(e) => setFormDisplayOrder(e.target.value)}
              hint="Sort sequence when listed on dish"
            />

            <Input
              label="Max Selections"
              type="number"
              min="1"
              placeholder="Unlimited"
              value={formMaxSelections}
              onChange={(e) => setFormMaxSelections(e.target.value)}
              hint="Leave blank for unlimited selections"
            />
          </div>

          <div className="pt-2">
            <Checkbox
              label="Required selection (customer must choose at least one)"
              checked={formRequired}
              onChange={(e) => setFormRequired(e.target.checked)}
            />
          </div>
        </form>
      </Modal>

      {/* Manage Group Options Membership Modal */}
      <Modal
        open={membershipModalOpen}
        title={`Manage Options · ${selectedGroup?.name ?? ''}`}
        onClose={() => setMembershipModalOpen(false)}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMembershipModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={membershipAction.busy}
              onClick={() => void handleSaveMembership()}
            >
              Save Member Options
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            Select and arrange the options available within this group. Use the arrow buttons to set
            their presentation order.
          </p>

          <Feedback error={membershipAction.error} />

          <SearchInput
            value={optionSearch}
            onChange={setOptionSearch}
            placeholder="Search available options…"
            label="Search options"
          />

          {!allOptionsResult?.data || allOptionsResult.data.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--muted)]">
              No options available.{' '}
              <Link href="/catalogue/options" className="text-[var(--orange-deep)] underline">
                Create options first
              </Link>
              .
            </p>
          ) : (
            <div className="max-h-96 divide-y divide-[var(--border)] overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border)]">
              {allOptionsResult.data
                .filter((opt) => {
                  if (!optionSearch.trim()) return true;
                  const q = optionSearch.toLowerCase();
                  return opt.name.toLowerCase().includes(q) || opt.code.toLowerCase().includes(q);
                })
                .map((opt) => {
                  const isMember = selectedOptionIds.includes(opt.id);
                  const memberIndex = selectedOptionIds.indexOf(opt.id);

                  return (
                    <div
                      key={opt.id}
                      className={`flex items-center justify-between p-3 transition-colors ${
                        isMember ? 'bg-[var(--cream-soft)]/50' : 'hover:bg-[var(--ivory)]'
                      }`}
                    >
                      <label className="flex flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isMember}
                          onChange={() => toggleOptionMembership(opt.id)}
                          className="h-4 w-4 rounded accent-[var(--orange-deep)]"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--navy)]">{opt.name}</span>
                            <span className="font-mono text-xs text-[var(--muted)]">
                              ({opt.code})
                            </span>
                          </div>
                          <p className="text-xs text-[var(--muted)]">
                            Cost: {rupees(opt.costCents)}
                            {opt.portionSize ? ` · ${opt.portionSize.name}` : ''}
                          </p>
                        </div>
                      </label>

                      {isMember ? (
                        <div className="flex items-center gap-1">
                          <span className="mr-2 text-xs font-semibold text-[var(--orange-deep)]">
                            #{memberIndex + 1}
                          </span>
                          <button
                            type="button"
                            disabled={memberIndex === 0}
                            onClick={() => moveOption(memberIndex, 'up')}
                            className="rounded p-1 text-[var(--muted)] hover:bg-[var(--cream)] disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            disabled={memberIndex === selectedOptionIds.length - 1}
                            onClick={() => moveOption(memberIndex, 'down')}
                            className="rounded p-1 text-[var(--muted)] hover:bg-[var(--cream)] disabled:opacity-30"
                            aria-label="Move down"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
