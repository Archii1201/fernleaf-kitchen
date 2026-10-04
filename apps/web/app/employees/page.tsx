'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { listRefs, type RefItem } from '../../lib/api/catalogue';
import { getCompany, listCompanies, type Company, type CompanyAddress } from '../../lib/api/companies';
import {
  createEmployee,
  listEmployees,
  updateEmployee,
  type Employee,
} from '../../lib/api/employees';
import { useAuth } from '../../lib/auth-context';
import { useAction, useLoad } from '../../lib/use-load';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, Feedback } from '../../components/ui/EmptyState';
import { Checkbox, Input, SearchInput, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader, Toolbar } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { Table, type Column } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

export default function EmployeesPage() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') ?? '';
  const initialCompany = searchParams.get('companyId') ?? '';

  const { can } = useAuth();
  const { toast } = useToast();
  const canManage = can('employees.manage');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialSearch);
  const [companyFilter, setCompanyFilter] = useState(initialCompany);
  const [activeFilter, setActiveFilter] = useState<'all' | 'true' | 'false'>('all');

  // Load companies for filter dropdown
  const { data: companiesData } = useLoad(() => listCompanies({ limit: 100 }), []);

  // Load reference tags
  const { data: allergensList } = useLoad(() => listRefs('allergens'), []);
  const { data: dietaryTagsList } = useLoad(() => listRefs('dietary-tags'), []);

  // Load employees
  const {
    data: employeesData,
    loading,
    error,
    reload,
  } = useLoad(
    () =>
      listEmployees({
        page,
        limit: 15,
        search: search.trim() || undefined,
        companyId: companyFilter || undefined,
        active: activeFilter === 'all' ? undefined : activeFilter === 'true',
      }),
    [page, search, companyFilter, activeFilter],
  );

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const handleOpenCreate = () => {
    setEditingEmployee(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setModalOpen(true);
  };

  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Full Name',
      render: (emp) => (
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-[var(--navy)]">{emp.fullName}</span>
            {emp.ownsCompany ? <Badge tone="orange">Owner</Badge> : null}
          </div>
          <p className="text-xs text-[var(--muted)]">{emp.email}</p>
          {emp.phone ? <p className="text-xs text-[var(--muted)]">{emp.phone}</p> : null}
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      render: (emp) => (
        <Link
          href={`/companies/${emp.company.id}`}
          className="font-medium text-[var(--navy)] hover:text-[var(--orange-deep)] hover:underline"
        >
          {emp.company.name}
        </Link>
      ),
    },
    {
      key: 'address',
      header: 'Default Location',
      hideBelow: 'md',
      render: (emp) =>
        emp.defaultAddress ? (
          <div>
            <p className="text-sm font-medium text-[var(--text)]">{emp.defaultAddress.label}</p>
            {emp.defaultAddress.city ? (
              <p className="text-xs text-[var(--muted)]">{emp.defaultAddress.city}</p>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-[var(--muted)]">Company Default</span>
        ),
    },
    {
      key: 'dietary',
      header: 'Allergies & Dietary',
      hideBelow: 'sm',
      render: (emp) => {
        const hasAllergens = emp.allergens && emp.allergens.length > 0;
        const hasDietary = emp.dietaryTags && emp.dietaryTags.length > 0;
        const hasNotes = Boolean(emp.allergyNotes || emp.dietaryNotes);

        if (!hasAllergens && !hasDietary && !hasNotes) {
          return <span className="text-xs text-[var(--muted)]">No restrictions</span>;
        }

        return (
          <div className="space-y-1">
            <div className="flex flex-wrap gap-1">
              {emp.allergens?.map((a) => (
                <Badge key={a.id} tone="danger">
                  ⚠ {a.name}
                </Badge>
              ))}
              {emp.dietaryTags?.map((d) => (
                <Badge key={d.id} tone="success">
                  {d.name}
                </Badge>
              ))}
            </div>
            {emp.allergyNotes ? (
              <p className="text-xs text-[var(--danger)]" title={emp.allergyNotes}>
                Note: {emp.allergyNotes}
              </p>
            ) : null}
            {emp.dietaryNotes && !emp.allergyNotes ? (
              <p className="text-xs text-[var(--muted)]" title={emp.dietaryNotes}>
                Note: {emp.dietaryNotes}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'permissions',
      header: 'Permissions',
      hideBelow: 'lg',
      render: (emp) => {
        const p = emp.deliveryPermissions;
        const canAny = p.canChooseAddress || p.canChooseDeliveryTime || p.canChoosePackaging;

        if (!canAny) {
          return <span className="text-xs text-[var(--muted)]">Standard</span>;
        }

        return (
          <div className="flex flex-wrap gap-1">
            {p.canChooseAddress ? <Badge tone="navy">Address</Badge> : null}
            {p.canChooseDeliveryTime ? <Badge tone="navy">Time</Badge> : null}
            {p.canChoosePackaging ? <Badge tone="navy">Packaging</Badge> : null}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (emp) =>
        emp.active ? (
          <Badge tone="success" dot>
            Active
          </Badge>
        ) : (
          <Badge tone="muted" dot>
            Inactive
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: 'Action',
      className: 'text-right',
      render: (emp) =>
        canManage ? (
          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(emp)}>
            Edit
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        eyebrow="Customer Directory"
        description="Manage customer corporate employees, individualized delivery permissions, allergies, and dietary requirements."
        actions={
          canManage ? (
            <Button icon="plus" onClick={handleOpenCreate}>
              New Employee
            </Button>
          ) : null
        }
      />

      <Card>
        <Toolbar>
          <SearchInput
            label="Search employees"
            placeholder="Search by name or email…"
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
          />

          <Select
            label="Filter by Company"
            value={companyFilter}
            onChange={(e) => {
              setCompanyFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-56"
          >
            <option value="">All Companies</option>
            {companiesData?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select
            label="Status"
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value as 'all' | 'true' | 'false');
              setPage(1);
            }}
            className="w-full sm:w-36"
          >
            <option value="all">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Toolbar>

        <Feedback error={error} />

        {loading ? (
          <SkeletonRows rows={8} />
        ) : !employeesData || employeesData.data.length === 0 ? (
          <EmptyState
            title="No employees found"
            hint={
              search || companyFilter || activeFilter !== 'all'
                ? 'No employees matched the selected search filters.'
                : 'No customer employees have been registered yet.'
            }
            icon="employees"
            action={
              canManage ? (
                <Button icon="plus" onClick={handleOpenCreate}>
                  Add First Employee
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <Table
              columns={columns}
              rows={employeesData.data}
              rowKey={(e) => e.id}
              caption="Customer employee directory"
            />

            <Pagination
              page={employeesData.meta.page}
              totalPages={employeesData.meta.totalPages}
              total={employeesData.meta.total}
              onPage={(p) => setPage(p)}
            />
          </>
        )}
      </Card>

      {/* Create / Edit Employee Modal */}
      {modalOpen ? (
        <EmployeeModal
          open={modalOpen}
          employee={editingEmployee}
          companies={companiesData?.data ?? []}
          allergens={allergensList ?? []}
          dietaryTags={dietaryTagsList ?? []}
          onClose={() => setModalOpen(false)}
          onSuccess={(saved) => {
            setModalOpen(false);
            toast(
              editingEmployee
                ? `Updated employee ${saved.fullName}.`
                : `Created employee ${saved.fullName}.`,
              'success',
            );
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function EmployeeModal({
  open,
  employee,
  companies,
  allergens,
  dietaryTags,
  onClose,
  onSuccess,
}: {
  open: boolean;
  employee: Employee | null;
  companies: Company[];
  allergens: RefItem[];
  dietaryTags: RefItem[];
  onClose: () => void;
  onSuccess: (emp: Employee) => void;
}) {
  const isEditing = Boolean(employee);

  const [companyId, setCompanyId] = useState(employee?.company.id ?? companies[0]?.id ?? '');
  const [fullName, setFullName] = useState(employee?.fullName ?? '');
  const [email, setEmail] = useState(employee?.email ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [defaultAddressId, setDefaultAddressId] = useState(employee?.defaultAddress?.id ?? '');
  const [canChooseAddress, setCanChooseAddress] = useState(
    employee?.deliveryPermissions.canChooseAddress ?? false,
  );
  const [canChooseDeliveryTime, setCanChooseDeliveryTime] = useState(
    employee?.deliveryPermissions.canChooseDeliveryTime ?? false,
  );
  const [canChoosePackaging, setCanChoosePackaging] = useState(
    employee?.deliveryPermissions.canChoosePackaging ?? false,
  );
  const [allergyNotes, setAllergyNotes] = useState(employee?.allergyNotes ?? '');
  const [dietaryNotes, setDietaryNotes] = useState(employee?.dietaryNotes ?? '');
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>(
    employee?.allergens?.map((a) => a.id) ?? [],
  );
  const [selectedDietary, setSelectedDietary] = useState<string[]>(
    employee?.dietaryTags?.map((d) => d.id) ?? [],
  );
  const [active, setActive] = useState(employee?.active ?? true);

  // Load chosen company addresses
  const [addresses, setAddresses] = useState<CompanyAddress[]>([]);
  useEffect(() => {
    if (!companyId) return;
    let isCurrent = true;
    getCompany(companyId)
      .then((c) => {
        if (isCurrent) setAddresses(c.addresses.filter((a) => a.active));
      })
      .catch(() => undefined);
    return () => {
      isCurrent = false;
    };
  }, [companyId]);

  const { run, busy, error } = useAction();

  const toggleAllergen = (id: string) => {
    setSelectedAllergens((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleDietary = (id: string) => {
    setSelectedDietary((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const payload: Record<string, unknown> = {
        companyId,
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        defaultAddressId: defaultAddressId || null,
        canChooseAddress,
        canChooseDeliveryTime,
        canChoosePackaging,
        allergenIds: selectedAllergens,
        dietaryTagIds: selectedDietary,
        allergyNotes: allergyNotes.trim() || undefined,
        dietaryNotes: dietaryNotes.trim() || undefined,
      };

      let result: Employee;
      if (isEditing && employee) {
        payload.active = active;
        result = await updateEmployee(employee.id, payload);
      } else {
        result = await createEmployee(payload);
      }
      onSuccess(result);
    });
  };

  return (
    <Modal
      open={open}
      title={isEditing ? `Edit: ${employee?.fullName}` : 'Add New Employee'}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" busy={busy} onClick={handleSubmit}>
            {isEditing ? 'Save Changes' : 'Create Employee'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Feedback error={error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Company"
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setDefaultAddressId('');
            }}
            required
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select
            label="Default Receiving Location"
            value={defaultAddressId}
            onChange={(e) => setDefaultAddressId(e.target.value)}
          >
            <option value="">Company Default Address</option>
            {addresses.map((addr) => (
              <option key={addr.id} value={addr.id}>
                {addr.label} — {addr.city}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full Name"
            placeholder="e.g. Alice Mehta"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="Corporate Email"
            type="email"
            placeholder="alice@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <Input
          label="Phone Number (Optional)"
          placeholder="+91 98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        {/* Permissions */}
        <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-4">
          <p className="eyebrow mb-2">Order Customization Permissions</p>
          <p className="mb-3 text-xs text-[var(--muted)]">
            Controls what this individual employee can choose or customize when placing lunch
            orders.
          </p>
          <div className="space-y-2">
            <Checkbox
              label="Can choose delivery address (defaults to company address)"
              checked={canChooseAddress}
              onChange={(e) => setCanChooseAddress(e.target.checked)}
            />
            <Checkbox
              label="Can choose delivery time (defaults to company schedule)"
              checked={canChooseDeliveryTime}
              onChange={(e) => setCanChooseDeliveryTime(e.target.checked)}
            />
            <Checkbox
              label="Can choose packaging standard"
              checked={canChoosePackaging}
              onChange={(e) => setCanChoosePackaging(e.target.checked)}
            />
          </div>
        </div>

        {/* Dietary and Allergens */}
        <div className="border-t border-[var(--border)] pt-4">
          <p className="eyebrow mb-2">Allergies & Dietary Preferences</p>

          <div className="grid gap-4 sm:grid-cols-2 mb-4">
            <div>
              <span className="text-xs font-semibold text-[var(--navy)]">Allergen Flags</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {allergens.map((a) => {
                  const selected = selectedAllergens.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAllergen(a.id)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                        selected
                          ? 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30'
                          : 'bg-white border border-[var(--border)] text-[var(--muted)] hover:border-[var(--orange)]'
                      }`}
                    >
                      {selected ? '✓ ' : ''}
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-[var(--navy)]">Dietary Preferences</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {dietaryTags.map((d) => {
                  const selected = selectedDietary.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDietary(d.id)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                        selected
                          ? 'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/30'
                          : 'bg-white border border-[var(--border)] text-[var(--muted)] hover:border-[var(--orange)]'
                      }`}
                    >
                      {selected ? '✓ ' : ''}
                      {d.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea
              label="Specific Allergy Notes"
              placeholder="e.g. Severe peanut allergy (anaphylaxis)"
              value={allergyNotes}
              onChange={(e) => setAllergyNotes(e.target.value)}
              rows={2}
            />
            <Textarea
              label="Dietary / Preference Notes"
              placeholder="e.g. Jain, strictly no onion/garlic"
              value={dietaryNotes}
              onChange={(e) => setDietaryNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {isEditing ? (
          <div className="border-t border-[var(--border)] pt-3">
            <Checkbox
              label="Active Employee Account (can sign in and receive meals)"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
