'use client';

import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Feedback } from '../../components/ui/EmptyState';
import { Input, SearchInput } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader, Toolbar } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { Table, type Column } from '../../components/ui/Table';
import {
  createStaff,
  listStaff,
  setStaffActive,
  setStaffRole,
  updateStaff,
  type Staff,
} from '../../lib/api/staff';
import { useAuth } from '../../lib/auth-context';
import { useAction, useLoad } from '../../lib/use-load';

interface RoleOption {
  id: string;
  name: string;
}

export default function StaffPage() {
  const { can, profile: currentProfile } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [changingRoleStaff, setChangingRoleStaff] = useState<Staff | null>(null);
  const [togglingStaff, setTogglingStaff] = useState<Staff | null>(null);

  // Form states: Create
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createStaffCode, setCreateStaffCode] = useState('');
  const [createRoleId, setCreateRoleId] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createJobTitle, setCreateJobTitle] = useState('');

  // Form states: Edit profile
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editJobTitle, setEditJobTitle] = useState('');

  // Form states: Change role
  const [newRoleId, setNewRoleId] = useState('');

  const { data, loading, error, reload } = useLoad(() => listStaff(page), [page]);
  const { run: runAction, busy: actionBusy, error: actionError, notice: actionNotice, setError: setActionError } = useAction();

  // Extract distinct roles from fetched staff members
  const availableRoles = useMemo<RoleOption[]>(() => {
    if (!data?.data) return [];
    const map = new Map<string, string>();
    for (const item of data.data) {
      if (item.role?.id && item.role?.name) {
        map.set(item.role.id, item.role.name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  const staffList = useMemo(() => {
    const list = data?.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (s) =>
        s.email.toLowerCase().includes(q) ||
        s.profile?.fullName?.toLowerCase().includes(q) ||
        s.profile?.staffCode?.toLowerCase().includes(q) ||
        s.profile?.jobTitle?.toLowerCase().includes(q) ||
        s.role?.name?.toLowerCase().includes(q),
    );
  }, [data, search]);

  const handleOpenCreate = () => {
    setCreateEmail('');
    setCreatePassword('');
    setCreateFullName('');
    setCreateStaffCode('');
    setCreateRoleId(availableRoles[0]?.id ?? '');
    setCreatePhone('');
    setCreateJobTitle('');
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const result = await runAction(
      () =>
        createStaff({
          email: createEmail.trim(),
          password: createPassword,
          roleId: createRoleId,
          staffCode: createStaffCode.trim(),
          fullName: createFullName.trim(),
          phone: createPhone.trim() || undefined,
          jobTitle: createJobTitle.trim() || undefined,
        }),
      `Staff member ${createFullName} created successfully!`,
    );
    if (result) {
      setShowCreateModal(false);
      reload();
    }
  };

  const handleOpenEdit = (staff: Staff) => {
    setEditingStaff(staff);
    setEditFullName(staff.profile?.fullName ?? '');
    setEditPhone(staff.profile?.phone ?? '');
    setEditJobTitle(staff.profile?.jobTitle ?? '');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    setActionError(null);
    const result = await runAction(
      () =>
        updateStaff(editingStaff.id, {
          fullName: editFullName.trim(),
          phone: editPhone.trim() || undefined,
          jobTitle: editJobTitle.trim() || undefined,
        }),
      `Profile updated for ${editFullName}`,
    );
    if (result) {
      setEditingStaff(null);
      reload();
    }
  };

  const handleOpenRoleChange = (staff: Staff) => {
    setChangingRoleStaff(staff);
    setNewRoleId(staff.role.id);
  };

  const handleRoleChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changingRoleStaff || !newRoleId) return;
    setActionError(null);
    const result = await runAction(
      () => setStaffRole(changingRoleStaff.id, newRoleId),
      `Role updated for ${changingRoleStaff.profile?.fullName ?? changingRoleStaff.email}`,
    );
    if (result) {
      setChangingRoleStaff(null);
      reload();
    }
  };

  const handleToggleActiveConfirm = async () => {
    if (!togglingStaff) return;
    setActionError(null);
    const nextState = !togglingStaff.active;
    const ok = await runAction(
      () => setStaffActive(togglingStaff.id, nextState),
      `Account ${nextState ? 'activated' : 'deactivated'} for ${togglingStaff.email}`,
    );
    if (ok !== undefined) {
      setTogglingStaff(null);
      reload();
    }
  };

  const staffColumns: Column<Staff>[] = [
    {
      key: 'name',
      header: 'Staff Name',
      render: (s) => (
        <div>
          <span className="font-bold text-[var(--navy)]">
            {s.profile?.fullName || '—'}
          </span>
          <p className="text-xs text-[var(--muted)] sm:hidden">{s.email}</p>
        </div>
      ),
    },
    {
      key: 'staffCode',
      header: 'Staff Code',
      render: (s) => (
        <span className="font-mono text-xs font-semibold text-[var(--navy)]">
          {s.profile?.staffCode || '—'}
        </span>
      ),
      hideBelow: 'sm',
    },
    {
      key: 'email',
      header: 'Email',
      render: (s) => <span className="text-[var(--text)]">{s.email}</span>,
      hideBelow: 'md',
    },
    {
      key: 'role',
      header: 'Role',
      render: (s) => (
        <span className="rounded bg-[var(--cream-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--navy)]">
          {s.role?.name || '—'}
        </span>
      ),
    },
    {
      key: 'jobTitle',
      header: 'Job Title',
      render: (s) => <span className="text-[var(--muted)]">{s.profile?.jobTitle || '—'}</span>,
      hideBelow: 'lg',
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (s) => <span className="text-xs text-[var(--muted)]">{s.profile?.phone || '—'}</span>,
      hideBelow: 'lg',
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <Badge tone={s.active ? 'success' : 'muted'} dot>
          {s.active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (s) =>
        can('staff.manage') ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleOpenEdit(s)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="subtle"
              onClick={() => handleOpenRoleChange(s)}
            >
              Role
            </Button>
            {s.id !== currentProfile?.id ? (
              <Button
                size="sm"
                variant={s.active ? 'danger' : 'navy'}
                onClick={() => setTogglingStaff(s)}
              >
                {s.active ? 'Deactivate' : 'Activate'}
              </Button>
            ) : null}
          </div>
        ) : null,
    },
  ];

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Administration"
        title="Staff Management"
        description="Internal workforce accounts, access permissions, operational roles, and contact profiles."
        actions={
          can('staff.manage') ? (
            <Button
              variant="primary"
              icon="plus"
              onClick={handleOpenCreate}
            >
              New Staff Member
            </Button>
          ) : undefined
        }
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter by name, code, email, or role…"
        />
        <Button
          variant="subtle"
          icon="refresh"
          onClick={reload}
          disabled={loading || actionBusy}
          className="ml-auto"
        >
          Refresh
        </Button>
      </Toolbar>

      <Feedback error={actionError} notice={actionNotice} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <SkeletonRows rows={8} />
      ) : staffList.length === 0 ? (
        <EmptyState
          icon="staff"
          title="No staff members found"
          hint={
            search
              ? `No staff members matched "${search}".`
              : 'No staff accounts exist yet.'
          }
          action={
            search ? (
              <Button variant="ghost" onClick={() => setSearch('')}>
                Clear Search
              </Button>
            ) : can('staff.manage') ? (
              <Button variant="primary" icon="plus" onClick={handleOpenCreate}>
                Create Staff Account
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Table
            columns={staffColumns}
            rows={staffList}
            rowKey={(s) => s.id}
          />

          {data?.meta && (
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              onPage={setPage}
            />
          )}
        </>
      )}

      {/* Create Staff Modal */}
      <Modal
        open={showCreateModal}
        title="Add Staff Member"
        onClose={() => setShowCreateModal(false)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowCreateModal(false)}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={actionBusy}
              onClick={handleCreateSubmit}
              disabled={
                !createEmail ||
                !createPassword ||
                !createFullName ||
                !createStaffCode ||
                !createRoleId ||
                actionBusy
              }
            >
              Create Account
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Full Name"
              placeholder="e.g. Ramesh Kumar"
              value={createFullName}
              onChange={(e) => setCreateFullName(e.target.value)}
              required
            />
            <Input
              label="Staff Code"
              placeholder="e.g. CHEF-003 or DRV-002"
              value={createStaffCode}
              onChange={(e) => setCreateStaffCode(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Email Address"
              type="email"
              placeholder="ramesh@fernleaf.com"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              required
            />
            <Input
              label="Temporary Password"
              type="password"
              placeholder="Min. 8 characters"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Operational Role"
              value={createRoleId}
              onChange={(e) => setCreateRoleId(e.target.value)}
              required
            >
              <option value="">Select role…</option>
              {availableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>

            <Input
              label="Job Title (Optional)"
              placeholder="e.g. Prep Cook, Delivery Lead"
              value={createJobTitle}
              onChange={(e) => setCreateJobTitle(e.target.value)}
            />
          </div>

          <Input
            label="Phone Number (Optional)"
            placeholder="+91 98765 43210"
            value={createPhone}
            onChange={(e) => setCreatePhone(e.target.value)}
          />
        </form>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        open={Boolean(editingStaff)}
        title="Edit Staff Profile"
        onClose={() => setEditingStaff(null)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setEditingStaff(null)}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={actionBusy}
              onClick={handleEditSubmit}
              disabled={!editFullName || actionBusy}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <Input
            label="Full Name"
            value={editFullName}
            onChange={(e) => setEditFullName(e.target.value)}
            required
          />
          <Input
            label="Job Title"
            placeholder="e.g. Head Chef"
            value={editJobTitle}
            onChange={(e) => setEditJobTitle(e.target.value)}
          />
          <Input
            label="Phone Number"
            placeholder="+91 98765 43210"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
          />
        </form>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        open={Boolean(changingRoleStaff)}
        title="Change Staff Role"
        onClose={() => setChangingRoleStaff(null)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setChangingRoleStaff(null)}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button
              variant="navy"
              busy={actionBusy}
              onClick={handleRoleChangeSubmit}
              disabled={!newRoleId || actionBusy}
            >
              Update Role
            </Button>
          </>
        }
      >
        <form onSubmit={handleRoleChangeSubmit} className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            Updating role for{' '}
            <strong className="text-[var(--navy)]">
              {changingRoleStaff?.profile?.fullName || changingRoleStaff?.email}
            </strong>
            . This changes the permissions and accessible sections immediately.
          </p>

          <Select
            label="Assigned Role"
            value={newRoleId}
            onChange={(e) => setNewRoleId(e.target.value)}
            required
          >
            {availableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
        </form>
      </Modal>

      {/* Toggle Active Confirmation */}
      <ConfirmDialog
        open={Boolean(togglingStaff)}
        title={togglingStaff?.active ? 'Deactivate Staff Account' : 'Activate Staff Account'}
        message={
          <>
            {togglingStaff?.active ? (
              <>
                Are you sure you want to deactivate the account for{' '}
                <strong className="text-[var(--navy)]">{togglingStaff?.email}</strong>? They will be
                logged out and unable to access the system until reactivated.
              </>
            ) : (
              <>
                Reactivate the account for{' '}
                <strong className="text-[var(--navy)]">{togglingStaff?.email}</strong>? They will regain
                access with their current role permissions.
              </>
            )}
          </>
        }
        confirmLabel={togglingStaff?.active ? 'Deactivate' : 'Activate'}
        tone={togglingStaff?.active ? 'danger' : 'navy'}
        busy={actionBusy}
        onConfirm={handleToggleActiveConfirm}
        onCancel={() => setTogglingStaff(null)}
      />
    </main>
  );
}
