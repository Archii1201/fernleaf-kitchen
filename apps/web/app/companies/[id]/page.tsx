'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { listDishes, listRefs } from '../../../lib/api/catalogue';
import {
  WEEKDAYS,
  addAddress,
  addCompanyHoliday,
  addDomain,
  eligibleDrivers,
  getCalendar,
  getCompany,
  getMenuVisibility,
  removeCompanyHoliday,
  removeDomain,
  replaceCalendar,
  replaceMenuVisibility,
  retireAddress,
  updateCompany,
  updateCompanyTier,
  updateDeliveryDefaults,
  type AddressInput,
  type Company,
  type CompanyAddress,
} from '../../../lib/api/companies';
import { createEmployee, listEmployees, type Employee } from '../../../lib/api/employees';
import { listCategories } from '../../../lib/api/menu';
import { listTiers, type PriceTier } from '../../../lib/api/pricing';
import { useAuth } from '../../../lib/auth-context';
import { formatDate } from '../../../lib/format';
import { useAction, useLoad } from '../../../lib/use-load';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState, ErrorState, Feedback } from '../../../components/ui/EmptyState';
import { Checkbox, Input, Textarea } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { Skeleton, SkeletonRows } from '../../../components/ui/Skeleton';
import { Table, type Column } from '../../../components/ui/Table';
import { Tabs } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/Toast';

type TabKey = 'overview' | 'delivery' | 'calendar' | 'domains' | 'addresses' | 'employees' | 'visibility';

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const { can } = useAuth();
  const canManage = can('companies.manage');

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Load Company Detail
  const {
    data: company,
    loading: companyLoading,
    error: companyError,
    reload: reloadCompany,
  } = useLoad(() => getCompany(id), [id]);

  // Load Price Tiers (for Overview tier change)
  const { data: tiers } = useLoad(listTiers, []);

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & PageHeader */}
      <div>
        <Link
          href="/companies"
          className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted)] hover:text-[var(--navy)]"
        >
          ← Back to Companies
        </Link>

        {companyLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        ) : companyError ? (
          <ErrorState message={companyError} onRetry={reloadCompany} />
        ) : company ? (
          <PageHeader
            title={company.name}
            eyebrow="Corporate Account"
            description={company.legalName ?? `Account ID: ${company.id}`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {company.priceTier ? (
                  <Badge tone="orange">Tier: {company.priceTier.name}</Badge>
                ) : (
                  <Badge tone="muted">Standard Default Tier</Badge>
                )}
                <Badge tone={company.active ? 'success' : 'muted'} dot>
                  {company.active ? 'Active Account' : 'Inactive'}
                </Badge>
              </div>
            }
          />
        ) : null}
      </div>

      {company ? (
        <>
          <Tabs<TabKey>
            label="Company sections"
            value={activeTab}
            onChange={(tab) => setActiveTab(tab)}
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'delivery', label: 'Delivery Defaults' },
              { value: 'calendar', label: 'Receiving Calendar' },
              { value: 'domains', label: 'Domains', count: company.domains.length },
              {
                value: 'addresses',
                label: 'Addresses',
                count: company.addresses.filter((a) => a.active).length,
              },
              { value: 'employees', label: 'Employees', count: company.employeeCount },
              { value: 'visibility', label: 'Menu Visibility' },
            ]}
          />

          <div className="fade-in">
            {activeTab === 'overview' && (
              <OverviewTab
                company={company}
                tiers={tiers ?? []}
                canManage={canManage}
                onReload={reloadCompany}
              />
            )}

            {activeTab === 'delivery' && (
              <DeliveryDefaultsTab
                company={company}
                canManage={canManage}
                onReload={reloadCompany}
              />
            )}

            {activeTab === 'calendar' && (
              <CalendarTab company={company} canManage={canManage} onReload={reloadCompany} />
            )}

            {activeTab === 'domains' && (
              <DomainsTab company={company} canManage={canManage} onReload={reloadCompany} />
            )}

            {activeTab === 'addresses' && (
              <AddressesTab company={company} canManage={canManage} onReload={reloadCompany} />
            )}

            {activeTab === 'employees' && (
              <EmployeesTab company={company} canManage={canManage} onReload={reloadCompany} />
            )}

            {activeTab === 'visibility' && (
              <MenuVisibilityTab company={company} canManage={canManage} />
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ============================================================================
// TAB 1: OVERVIEW
// ============================================================================
function OverviewTab({
  company,
  tiers,
  canManage,
  onReload,
}: {
  company: Company;
  tiers: PriceTier[];
  canManage: boolean;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState(company.priceTier?.id ?? '');
  const { run: runTierUpdate, busy: tierUpdating, error: tierError } = useAction();

  const handleUpdateTier = async (newTierId: string) => {
    setSelectedTierId(newTierId);
    await runTierUpdate(async () => {
      await updateCompanyTier(company.id, newTierId || null);
      toast('Company pricing tier updated successfully.', 'success');
      onReload();
    });
  };

  return (
    <div className="space-y-6">
      <Feedback error={tierError} />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Company Overview Card */}
        <Card>
          <CardHeader
            eyebrow="Account Details"
            title="General Information"
            action={
              canManage ? (
                <Button variant="ghost" size="sm" onClick={() => setIsEditOpen(true)}>
                  Edit Details
                </Button>
              ) : null
            }
          />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Company Name
              </dt>
              <dd className="serif text-lg font-semibold text-[var(--navy)]">{company.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Legal Entity Name
              </dt>
              <dd className="text-[var(--text)]">{company.legalName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Account Owner Employee
              </dt>
              <dd className="text-[var(--text)]">
                {company.owner ? (
                  <span className="font-medium text-[var(--navy)]">
                    {company.owner.fullName} ({company.owner.email})
                  </span>
                ) : (
                  <span className="text-[var(--muted)]">None assigned</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Active Status
              </dt>
              <dd className="pt-1">
                <Badge tone={company.active ? 'success' : 'muted'} dot>
                  {company.active ? 'Active' : 'Deactivated'}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>

        {/* Pricing Tier Card */}
        <Card>
          <CardHeader eyebrow="Invoicing & Rates" title="Pricing Tier" />
          <div className="space-y-4 text-sm">
            <p className="text-[var(--muted)]">
              Determines menu item costs and custom contract pricing for all employees of this
              company.
            </p>

            <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Current Assigned Tier
                  </p>
                  <p className="serif text-xl font-semibold text-[var(--navy)]">
                    {company.priceTier ? company.priceTier.name : 'Standard Default Tier'}
                  </p>
                </div>
                {company.priceTier ? (
                  <Badge tone="orange">{company.priceTier.code}</Badge>
                ) : (
                  <Badge tone="muted">System Default</Badge>
                )}
              </div>
            </div>

            {canManage ? (
              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Assign Different Price Tier
                </label>
                <div className="flex gap-2">
                  <Select
                    label=""
                    value={selectedTierId}
                    onChange={(e) => handleUpdateTier(e.target.value)}
                    disabled={tierUpdating}
                    className="flex-1"
                  >
                    <option value="">Default Price Tier (Inherited)</option>
                    {tiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.rule}) {t.isDefault ? '— Default' : ''}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        {/* Billing Contact Card */}
        <Card>
          <CardHeader eyebrow="Invoicing" title="Billing Contact" />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Contact Person
              </dt>
              <dd className="font-medium text-[var(--navy)]">
                {company.billingContact.name ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Billing Email
              </dt>
              <dd className="text-[var(--text)]">
                {company.billingContact.email ? (
                  <a
                    href={`mailto:${company.billingContact.email}`}
                    className="underline hover:text-[var(--orange-deep)]"
                  >
                    {company.billingContact.email}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Phone
              </dt>
              <dd className="text-[var(--text)]">{company.billingContact.phone ?? '—'}</dd>
            </div>
          </dl>
        </Card>

        {/* Quick Stats Card */}
        <Card>
          <CardHeader eyebrow="Operations" title="Account Summary" />
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="rounded-[var(--radius-sm)] bg-[var(--cream-soft)] p-4">
              <span className="serif text-3xl font-semibold text-[var(--navy)]">
                {company.employeeCount}
              </span>
              <p className="mt-1 text-xs font-medium text-[var(--muted)]">Registered Employees</p>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-[var(--cream-soft)] p-4">
              <span className="serif text-3xl font-semibold text-[var(--navy)]">
                {company.addresses.filter((a) => a.active).length}
              </span>
              <p className="mt-1 text-xs font-medium text-[var(--muted)]">Delivery Locations</p>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-[var(--cream-soft)] p-4">
              <span className="serif text-3xl font-semibold text-[var(--navy)]">
                {company.domains.length}
              </span>
              <p className="mt-1 text-xs font-medium text-[var(--muted)]">Verified Domains</p>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-[var(--cream-soft)] p-4">
              <span className="serif text-3xl font-semibold text-[var(--navy)]">
                {company.workingDays.length}
              </span>
              <p className="mt-1 text-xs font-medium text-[var(--muted)]">Working Days / Wk</p>
            </div>
          </div>
        </Card>
      </div>

      {isEditOpen ? (
        <EditCompanyModal
          open={isEditOpen}
          company={company}
          onClose={() => setIsEditOpen(false)}
          onSuccess={() => {
            setIsEditOpen(false);
            toast('Updated company details.', 'success');
            onReload();
          }}
        />
      ) : null}
    </div>
  );
}

function EditCompanyModal({
  open,
  company,
  onClose,
  onSuccess,
}: {
  open: boolean;
  company: Company;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(company.name);
  const [legalName, setLegalName] = useState(company.legalName ?? '');
  const [billingContactName, setBillingContactName] = useState(company.billingContact.name ?? '');
  const [billingContactEmail, setBillingContactEmail] = useState(
    company.billingContact.email ?? '',
  );
  const [billingContactPhone, setBillingContactPhone] = useState(
    company.billingContact.phone ?? '',
  );
  const [active, setActive] = useState(company.active);

  const { run, busy, error } = useAction();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      await updateCompany(company.id, {
        name: name.trim(),
        legalName: legalName.trim() || undefined,
        billingContactName: billingContactName.trim() || undefined,
        billingContactEmail: billingContactEmail.trim() || undefined,
        billingContactPhone: billingContactPhone.trim() || undefined,
        active,
      });
      onSuccess();
    });
  };

  return (
    <Modal
      open={open}
      title="Edit Company Details"
      onClose={onClose}
      size="lg"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Company Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Legal Entity Name"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <p className="eyebrow mb-2">Billing Contact</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Contact Person"
              value={billingContactName}
              onChange={(e) => setBillingContactName(e.target.value)}
            />
            <Input
              label="Billing Email"
              type="email"
              value={billingContactEmail}
              onChange={(e) => setBillingContactEmail(e.target.value)}
            />
            <Input
              label="Phone"
              value={billingContactPhone}
              onChange={(e) => setBillingContactPhone(e.target.value)}
            />
          </div>
        </div>

        <div className="pt-2">
          <Checkbox
            label="Active account (allows orders and employee signups)"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// TAB 2: DELIVERY DEFAULTS
// ============================================================================
function DeliveryDefaultsTab({
  company,
  canManage,
  onReload,
}: {
  company: Company;
  canManage: boolean;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const defaults = company.deliveryDefaults;

  // Load eligible drivers
  const { data: drivers } = useLoad(eligibleDrivers, []);

  // Load packaging types
  const { data: packagingTypes } = useLoad(() => listRefs('packaging-types'), []);

  const [addressId, setAddressId] = useState(defaults.defaultAddressId ?? '');
  const [deliveryTime, setDeliveryTime] = useState(
    defaults.defaultDeliveryTime ? defaults.defaultDeliveryTime.slice(0, 5) : '',
  );
  const [packagingId, setPackagingId] = useState(defaults.packagingType?.id ?? '');
  const [leaveKitchen, setLeaveKitchen] = useState(String(defaults.leaveKitchenMinutes ?? 60));
  const [driverStaffId, setDriverStaffId] = useState(defaults.defaultDriver?.id ?? '');
  const [driverInstructions, setDriverInstructions] = useState(defaults.driverInstructions ?? '');

  const { run, busy, error } = useAction();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const minutes = Number.parseInt(leaveKitchen, 10);
      if (Number.isNaN(minutes) || minutes < 0) {
        throw new Error('Leave kitchen minutes must be a positive number.');
      }

      await updateDeliveryDefaults(company.id, {
        defaultAddressId: addressId || null,
        defaultDeliveryTime: deliveryTime || null,
        defaultPackagingTypeId: packagingId || null,
        leaveKitchenMinutes: minutes,
        defaultDriverStaffId: driverStaffId || null,
        driverInstructions: driverInstructions.trim() || null,
      });

      toast('Delivery defaults saved successfully.', 'success');
      onReload();
    });
  };

  const activeAddresses = company.addresses.filter((a) => a.active);

  return (
    <Card className="max-w-3xl">
      <CardHeader
        eyebrow="Logistics & Dispatch"
        title="Standing Delivery Defaults"
      />
      <p className="mb-6 text-sm text-[var(--muted)]">
        These settings are automatically applied to employee lunch orders unless explicitly
        overridden by the individual order or authorized staff.
      </p>

      <form onSubmit={handleSave} className="space-y-5">
        <Feedback error={error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Default Delivery Location"
            hint="Must be one of the registered active company addresses."
            value={addressId}
            onChange={(e) => setAddressId(e.target.value)}
            disabled={!canManage}
          >
            <option value="">Select default delivery address…</option>
            {activeAddresses.map((addr) => (
              <option key={addr.id} value={addr.id}>
                {addr.label} — {addr.line1}, {addr.city}
              </option>
            ))}
          </Select>

          <Input
            label="Default Delivery Time (HH:mm)"
            type="time"
            hint="Scheduled arrival time at customer premises."
            value={deliveryTime}
            onChange={(e) => setDeliveryTime(e.target.value)}
            disabled={!canManage}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Default Packaging Type"
            value={packagingId}
            onChange={(e) => setPackagingId(e.target.value)}
            disabled={!canManage}
          >
            <option value="">Select packaging standard…</option>
            {packagingTypes?.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} ({pkg.code})
              </option>
            ))}
          </Select>

          <Input
            label="Minutes Before Delivery To Leave Kitchen"
            type="number"
            hint="Standard dispatch travel buffer (e.g. 60 mins)."
            value={leaveKitchen}
            onChange={(e) => setLeaveKitchen(e.target.value)}
            disabled={!canManage}
            required
          />
        </div>

        <Select
          label="Preferred Default Driver"
          hint="Assigned driver holding delivery route authorization."
          value={driverStaffId}
          onChange={(e) => setDriverStaffId(e.target.value)}
          disabled={!canManage}
        >
          <option value="">No specific driver (Auto / Any available)</option>
          {drivers?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.fullName} ({d.staffCode})
            </option>
          ))}
        </Select>

        <Textarea
          label="Standing Driver Instructions"
          hint="Permanent instructions displayed to the delivery driver on every drop to this company."
          placeholder="e.g. Gate 3 delivery entrance; call reception on arrival at intercom 401; ask for Security badge."
          value={driverInstructions}
          onChange={(e) => setDriverInstructions(e.target.value)}
          disabled={!canManage}
          rows={3}
        />

        {canManage ? (
          <div className="flex justify-end pt-2">
            <Button type="submit" busy={busy}>
              Save Delivery Defaults
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

// ============================================================================
// TAB 3: RECEIVING CALENDAR
// ============================================================================
function CalendarTab({
  company,
  canManage,
  onReload,
}: {
  company: Company;
  canManage: boolean;
  onReload: () => void;
}) {
  const { toast } = useToast();

  const {
    data: calendar,
    loading: calendarLoading,
    error: calendarError,
    reload: reloadCalendar,
  } = useLoad(() => getCalendar(company.id), [company.id]);

  const [editedDays, setEditedDays] = useState<string[] | null>(null);
  const selectedDays = editedDays ?? calendar?.workingDays ?? [];

  const { run: runSaveWeek, busy: savingWeek, error: saveWeekError } = useAction();
  const { run: runHolidayAction, busy: holidayBusy, error: holidayError } = useAction();

  // Add holiday form state
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');

  const toggleDay = (day: string) => {
    if (!canManage) return;
    const current = editedDays ?? calendar?.workingDays ?? [];
    setEditedDays(
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );
  };

  const handleSaveWorkingDays = async () => {
    await runSaveWeek(async () => {
      await replaceCalendar(company.id, selectedDays);
      toast('Company working days schedule updated.', 'success');
      setEditedDays(null);
      reloadCalendar();
      onReload();
    });
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate) return;
    await runHolidayAction(async () => {
      await addCompanyHoliday(company.id, {
        date: newDate,
        name: newName.trim() || undefined,
      });
      toast(`Added blackout holiday for ${formatDate(newDate)}.`, 'success');
      setNewDate('');
      setNewName('');
      reloadCalendar();
    });
  };

  const handleRemoveHoliday = async (holidayId: string, date: string) => {
    const ok = window.confirm(`Remove delivery holiday on ${formatDate(date)}?`);
    if (!ok) return;
    await runHolidayAction(async () => {
      await removeCompanyHoliday(company.id, holidayId);
      toast('Holiday removed.', 'success');
      reloadCalendar();
    });
  };

  return (
    <div className="space-y-6">
      <Feedback error={calendarError ?? saveWeekError ?? holidayError} />

      {/* Working Days Card */}
      <Card>
        <CardHeader
          eyebrow="Schedule"
          title="Receiving Working Days"
          action={
            canManage ? (
              <Button size="sm" busy={savingWeek} onClick={handleSaveWorkingDays}>
                Save Working Days
              </Button>
            ) : null
          }
        />
        <p className="mb-4 text-sm text-[var(--muted)]">
          Select days of the week on which this company is open to receive meal deliveries. Orders
          cannot be placed for delivery on unselected days.
        </p>

        {calendarLoading ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const isSelected = selectedDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!canManage}
                  onClick={() => toggleDay(day)}
                  className={`rounded-[var(--radius-sm)] border px-4 py-2 text-sm font-semibold transition-all duration-150 ${
                    isSelected
                      ? 'border-[var(--orange-deep)] bg-[var(--orange-soft)] text-[#a85f0c] shadow-sm'
                      : 'border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--orange)]'
                  }`}
                >
                  {day.charAt(0) + day.slice(1).toLowerCase()} {isSelected ? '✓' : ''}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Company Holidays Card */}
      <Card>
        <CardHeader eyebrow="Blackouts" title="Company Delivery Holidays" />
        <p className="mb-4 text-sm text-[var(--muted)]">
          Specific calendar dates when the client premises are closed (e.g. corporate offsite or
          company-specific holidays).
        </p>

        {canManage ? (
          <form
            onSubmit={handleAddHoliday}
            className="mb-6 flex flex-wrap items-end gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-4"
          >
            <div className="min-w-[180px]">
              <Input
                label="Holiday Date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                required
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Input
                label="Reason / Occasion"
                placeholder="e.g. Annual Company Retreat"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" busy={holidayBusy}>
              + Add Holiday
            </Button>
          </form>
        ) : null}

        {calendarLoading ? (
          <SkeletonRows rows={4} />
        ) : !calendar?.holidays || calendar.holidays.length === 0 ? (
          <EmptyState
            title="No delivery holidays scheduled"
            hint="Orders will run normally according to the working week schedule."
            icon="clock"
          />
        ) : (
          <div className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)] bg-white">
            {calendar.holidays.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between p-4 transition-colors hover:bg-[var(--cream-soft)]"
              >
                <div>
                  <p className="font-semibold text-[var(--navy)]">{formatDate(h.date)}</p>
                  <p className="text-xs text-[var(--muted)]">{h.name ?? 'Company closed'}</p>
                </div>
                {canManage ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleRemoveHoliday(h.id, h.date)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// TAB 4: DOMAINS
// ============================================================================
function DomainsTab({
  company,
  canManage,
  onReload,
}: {
  company: Company;
  canManage: boolean;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const [newDomain, setNewDomain] = useState('');
  const { run, busy, error } = useAction();

  const cleanDomain = (d: string) =>
    d
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/^https?:\/\//, '')
      .split('/')[0];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const dom = cleanDomain(newDomain);
    if (!dom || !dom.includes('.')) {
      toast('Please enter a valid domain like acme.com', 'warning');
      return;
    }

    await run(async () => {
      await addDomain(company.id, dom);
      toast(`Added domain @${dom}.`, 'success');
      setNewDomain('');
      onReload();
    });
  };

  const handleRemove = async (domainId: string, domainName: string) => {
    if (company.domains.length <= 1) {
      toast('Cannot remove the last domain. A company must hold at least one domain.', 'warning');
      return;
    }

    const ok = window.confirm(`Remove corporate email domain "@${domainName}"?`);
    if (!ok) return;

    await run(async () => {
      await removeDomain(company.id, domainId);
      toast(`Removed domain @${domainName}.`, 'success');
      onReload();
    });
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader eyebrow="Email Routing" title="Corporate Email Domains" />
      <p className="mb-4 text-sm text-[var(--muted)]">
        Employees registering with an email matching any of these domains will automatically be
        associated with {company.name}.
      </p>

      <Feedback error={error} />

      {canManage ? (
        <form onSubmit={handleAdd} className="mb-6 flex items-end gap-3">
          <div className="flex-1">
            <Input
              label="Add Email Domain"
              placeholder="e.g. subsidiary-holding.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              required
            />
          </div>
          <Button type="submit" size="sm" busy={busy}>
            + Add Domain
          </Button>
        </form>
      ) : null}

      <div className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)] bg-white">
        {company.domains.map((d) => (
          <div key={d.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-[var(--navy)]">
                @{d.domain}
              </span>
              <Badge tone="navy">Verified</Badge>
            </div>
            {canManage ? (
              <Button
                variant="danger"
                size="sm"
                disabled={company.domains.length <= 1}
                onClick={() => handleRemove(d.id, d.domain)}
              >
                Remove
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ============================================================================
// TAB 5: ADDRESSES
// ============================================================================
function AddressesTab({
  company,
  canManage,
  onReload,
}: {
  company: Company;
  canManage: boolean;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const { run, busy, error } = useAction();

  const handleRetire = async (addr: CompanyAddress) => {
    const ok = window.confirm(`Retire address "${addr.label}"? Historical records will stay intact.`);
    if (!ok) return;

    await run(async () => {
      await retireAddress(company.id, addr.id);
      toast(`Retired address "${addr.label}".`, 'success');
      onReload();
    });
  };

  const activeAddresses = company.addresses.filter((a) => a.active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="serif text-2xl font-semibold text-[var(--navy)]">Delivery Locations</h2>
          <p className="text-sm text-[var(--muted)]">
            Registered physical locations for kitchen meal dropoffs.
          </p>
        </div>
        {canManage ? (
          <Button icon="plus" size="sm" onClick={() => setIsAddOpen(true)}>
            Add Address
          </Button>
        ) : null}
      </div>

      <Feedback error={error} />

      {activeAddresses.length === 0 ? (
        <EmptyState
          title="No delivery addresses registered"
          hint="Add at least one building or campus address for order delivery."
          icon="map"
          action={
            canManage ? (
              <Button icon="plus" onClick={() => setIsAddOpen(true)}>
                Add Delivery Address
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeAddresses.map((addr) => {
            const isDefault = company.deliveryDefaults.defaultAddressId === addr.id;
            return (
              <Card key={addr.id} className="relative flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="serif text-lg font-semibold text-[var(--navy)]">{addr.label}</p>
                    {isDefault ? (
                      <Badge tone="orange" dot>
                        Default Drop
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-sm text-[var(--text)] space-y-1">
                    <p>{addr.line1}</p>
                    {addr.line2 ? <p className="text-[var(--muted)]">{addr.line2}</p> : null}
                    <p>
                      {addr.city}
                      {addr.state ? `, ${addr.state}` : ''} {addr.postalCode}
                    </p>
                    <p className="text-xs text-[var(--muted)]">{addr.country}</p>
                  </div>
                  {addr.deliveryNotes ? (
                    <div className="mt-3 rounded bg-[var(--ivory)] p-2 text-xs text-[var(--muted)] border border-[var(--border)]">
                      <span className="font-semibold text-[var(--navy)]">Notes: </span>
                      {addr.deliveryNotes}
                    </div>
                  ) : null}
                </div>

                {canManage ? (
                  <div className="mt-4 flex justify-end border-t border-[var(--border)] pt-3">
                    <Button
                      variant="danger"
                      size="sm"
                      busy={busy}
                      onClick={() => handleRetire(addr)}
                    >
                      Retire Address
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {isAddOpen ? (
        <AddAddressModal
          open={isAddOpen}
          companyId={company.id}
          onClose={() => setIsAddOpen(false)}
          onSuccess={() => {
            setIsAddOpen(false);
            toast('Address added successfully.', 'success');
            onReload();
          }}
        />
      ) : null}
    </div>
  );
}

function AddAddressModal({
  open,
  companyId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [label, setLabel] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('IN');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  const { run, busy, error } = useAction();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const body: AddressInput = {
        label: label.trim(),
        line1: line1.trim(),
        city: city.trim(),
        postalCode: postalCode.trim(),
        country: country.trim() || 'IN',
      };
      if (line2.trim()) body.line2 = line2.trim();
      if (state.trim()) body.state = state.trim();
      if (deliveryNotes.trim()) body.deliveryNotes = deliveryNotes.trim();

      await addAddress(companyId, body);
      onSuccess();
    });
  };

  return (
    <Modal
      open={open}
      title="Add Delivery Address"
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" busy={busy} onClick={handleSubmit}>
            Save Address
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Feedback error={error} />
        <Input
          label="Location Label"
          placeholder="e.g. Main Tower Reception or Floor 3 Hub"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          autoFocus
        />
        <Input
          label="Address Line 1"
          placeholder="Street address, building number"
          value={line1}
          onChange={(e) => setLine1(e.target.value)}
          required
        />
        <Input
          label="Address Line 2 (Optional)"
          placeholder="Suite, wing, or landmark"
          value={line2}
          onChange={(e) => setLine2(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="City"
            placeholder="e.g. Bengaluru"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
          />
          <Input
            label="State"
            placeholder="e.g. Karnataka"
            value={state}
            onChange={(e) => setState(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Postal Code (PIN)"
            placeholder="e.g. 560001"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            required
          />
          <Input
            label="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            required
          />
        </div>
        <Textarea
          label="Delivery Access Notes"
          placeholder="e.g. Hand off to reception desk staff"
          value={deliveryNotes}
          onChange={(e) => setDeliveryNotes(e.target.value)}
          rows={2}
        />
      </form>
    </Modal>
  );
}

// ============================================================================
// TAB 6: EMPLOYEES
// ============================================================================
function EmployeesTab({
  company,
  canManage,
  onReload,
}: {
  company: Company;
  canManage: boolean;
  onReload: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const {
    data: employeesData,
    loading,
    error,
    reload: reloadEmployees,
  } = useLoad(() => listEmployees({ companyId: company.id, page, limit: 10 }), [company.id, page]);

  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Full Name',
      render: (emp) => (
        <div>
          <p className="font-semibold text-[var(--navy)]">{emp.fullName}</p>
          {emp.ownsCompany ? <Badge tone="orange">Owner</Badge> : null}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (emp) => (
        <div>
          <p className="text-sm text-[var(--text)]">{emp.email}</p>
          {emp.phone ? <p className="text-xs text-[var(--muted)]">{emp.phone}</p> : null}
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Default Location',
      hideBelow: 'md',
      render: (emp) =>
        emp.defaultAddress ? (
          <span className="text-sm text-[var(--text)]">{emp.defaultAddress.label}</span>
        ) : (
          <span className="text-xs text-[var(--muted)]">Company default</span>
        ),
    },
    {
      key: 'permissions',
      header: 'Order Permissions',
      hideBelow: 'sm',
      render: (emp) => (
        <div className="flex flex-wrap gap-1">
          {emp.deliveryPermissions.canChooseAddress ? (
            <Badge tone="navy">Address</Badge>
          ) : null}
          {emp.deliveryPermissions.canChooseDeliveryTime ? (
            <Badge tone="navy">Time</Badge>
          ) : null}
          {emp.deliveryPermissions.canChoosePackaging ? (
            <Badge tone="navy">Packaging</Badge>
          ) : null}
          {!emp.deliveryPermissions.canChooseAddress &&
          !emp.deliveryPermissions.canChooseDeliveryTime &&
          !emp.deliveryPermissions.canChoosePackaging ? (
            <span className="text-xs text-[var(--muted)]">Standard defaults</span>
          ) : null}
        </div>
      ),
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
      header: 'Actions',
      className: 'text-right',
      render: (emp) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/employees?search=${encodeURIComponent(emp.email)}`)}
        >
          View in Directory →
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        eyebrow="Staff Directory"
        title={`Employees at ${company.name}`}
        action={
          canManage ? (
            <Button icon="plus" size="sm" onClick={() => setIsAddOpen(true)}>
              Add Employee
            </Button>
          ) : null
        }
      />

      <Feedback error={error} />

      {loading ? (
        <SkeletonRows rows={5} />
      ) : !employeesData || employeesData.data.length === 0 ? (
        <EmptyState
          title="No employees registered"
          hint="Employees can sign up using verified company domains, or be manually added here."
          icon="employees"
          action={
            canManage ? (
              <Button icon="plus" onClick={() => setIsAddOpen(true)}>
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
            caption={`Employees belonging to ${company.name}`}
          />

          <Pagination
            page={employeesData.meta.page}
            totalPages={employeesData.meta.totalPages}
            total={employeesData.meta.total}
            onPage={(p) => setPage(p)}
          />
        </>
      )}

      {isAddOpen ? (
        <AddCompanyEmployeeModal
          open={isAddOpen}
          company={company}
          onClose={() => setIsAddOpen(false)}
          onSuccess={() => {
            setIsAddOpen(false);
            toast('Created employee account.', 'success');
            reloadEmployees();
            onReload();
          }}
        />
      ) : null}
    </Card>
  );
}

function AddCompanyEmployeeModal({
  open,
  company,
  onClose,
  onSuccess,
}: {
  open: boolean;
  company: Company;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [addressId, setAddressId] = useState('');
  const [canChooseAddress, setCanChooseAddress] = useState(false);
  const [canChooseDeliveryTime, setCanChooseDeliveryTime] = useState(false);
  const [canChoosePackaging, setCanChoosePackaging] = useState(false);
  const [allergyNotes, setAllergyNotes] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');

  const { run, busy, error } = useAction();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      await createEmployee({
        companyId: company.id,
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        defaultAddressId: addressId || undefined,
        canChooseAddress,
        canChooseDeliveryTime,
        canChoosePackaging,
        allergyNotes: allergyNotes.trim() || undefined,
        dietaryNotes: dietaryNotes.trim() || undefined,
      });
      onSuccess();
    });
  };

  const activeAddresses = company.addresses.filter((a) => a.active);

  return (
    <Modal
      open={open}
      title={`Add Employee to ${company.name}`}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" busy={busy} onClick={handleSubmit}>
            Create Employee
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Feedback error={error} />

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
            placeholder={`e.g. alice@${company.domains[0]?.domain ?? 'company.com'}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Phone Number"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <Select
            label="Default Receiving Location"
            value={addressId}
            onChange={(e) => setAddressId(e.target.value)}
          >
            <option value="">Company Default Address</option>
            {activeAddresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.city})
              </option>
            ))}
          </Select>
        </div>

        <div className="border-t border-[var(--border)] pt-3">
          <p className="eyebrow mb-2">Order Customization Permissions</p>
          <div className="space-y-2">
            <Checkbox
              label="Allowed to choose delivery location on orders"
              checked={canChooseAddress}
              onChange={(e) => setCanChooseAddress(e.target.checked)}
            />
            <Checkbox
              label="Allowed to choose custom delivery time on orders"
              checked={canChooseDeliveryTime}
              onChange={(e) => setCanChooseDeliveryTime(e.target.checked)}
            />
            <Checkbox
              label="Allowed to choose custom packaging"
              checked={canChoosePackaging}
              onChange={(e) => setCanChoosePackaging(e.target.checked)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 border-t border-[var(--border)] pt-3">
          <Textarea
            label="Allergy Notes"
            placeholder="e.g. Severe peanut allergy"
            value={allergyNotes}
            onChange={(e) => setAllergyNotes(e.target.value)}
            rows={2}
          />
          <Textarea
            label="Dietary Notes"
            placeholder="e.g. Jain vegetarian, no garlic"
            value={dietaryNotes}
            onChange={(e) => setDietaryNotes(e.target.value)}
            rows={2}
          />
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// TAB 7: MENU VISIBILITY
// ============================================================================
function MenuVisibilityTab({ company, canManage }: { company: Company; canManage: boolean }) {
  const { toast } = useToast();

  // Load current hidden visibility for this company
  const {
    data: visibility,
    loading: visLoading,
    error: visError,
    reload: reloadVis,
  } = useLoad(() => getMenuVisibility(company.id), [company.id]);

  // Load all categories
  const { data: categories, loading: catLoading } = useLoad(listCategories, []);

  // Load dishes
  const { data: dishesData, loading: dishesLoading } = useLoad(
    () => listDishes({ limit: 100, active: true }),
    [],
  );

  const [editedCatIds, setEditedCatIds] = useState<string[] | null>(null);
  const [editedDishIds, setEditedDishIds] = useState<string[] | null>(null);

  const hiddenCatIds = editedCatIds ?? visibility?.hiddenCategories.map((c) => c.id) ?? [];
  const hiddenDishIds = editedDishIds ?? visibility?.hiddenDishes.map((d) => d.id) ?? [];

  const { run, busy, error } = useAction();

  const toggleCategory = (catId: string) => {
    if (!canManage) return;
    const current = editedCatIds ?? visibility?.hiddenCategories.map((c) => c.id) ?? [];
    setEditedCatIds(
      current.includes(catId) ? current.filter((id) => id !== catId) : [...current, catId],
    );
  };

  const toggleDish = (dishId: string) => {
    if (!canManage) return;
    const current = editedDishIds ?? visibility?.hiddenDishes.map((d) => d.id) ?? [];
    setEditedDishIds(
      current.includes(dishId) ? current.filter((id) => id !== dishId) : [...current, dishId],
    );
  };

  const handleSave = async () => {
    await run(async () => {
      await replaceMenuVisibility(company.id, {
        hiddenCategoryIds: hiddenCatIds,
        hiddenDishIds: hiddenDishIds,
      });
      toast('Menu visibility rules updated.', 'success');
      setEditedCatIds(null);
      setEditedDishIds(null);
      reloadVis();
    });
  };

  const isLoading = visLoading || catLoading || dishesLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="serif text-2xl font-semibold text-[var(--navy)]">Menu Visibility Rules</h2>
          <p className="text-sm text-[var(--muted)]">
            Hide specific menu categories or dishes from this company&apos;s employees.
          </p>
        </div>
        {canManage ? (
          <Button busy={busy} onClick={handleSave}>
            Save Visibility Rules
          </Button>
        ) : null}
      </div>

      <Feedback error={visError ?? error} />

      {isLoading ? (
        <SkeletonRows rows={8} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Categories Card */}
          <Card>
            <CardHeader
              eyebrow="Category Filter"
              title="Menu Categories"
            />
            <p className="mb-4 text-xs text-[var(--muted)]">
              Checked categories are HIDDEN from employees of this company.
            </p>

            <div className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)] bg-white">
              {categories?.map((cat) => {
                const isHidden = hiddenCatIds.includes(cat.id);
                return (
                  <label
                    key={cat.id}
                    className="flex cursor-pointer items-center justify-between p-3.5 hover:bg-[var(--cream-soft)] transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-[var(--navy)]">{cat.name}</span>
                      <p className="text-xs text-[var(--muted)]">{cat.slug}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isHidden ? <Badge tone="danger">Hidden</Badge> : <Badge tone="success">Visible</Badge>}
                      <input
                        type="checkbox"
                        checked={isHidden}
                        disabled={!canManage}
                        onChange={() => toggleCategory(cat.id)}
                        className="h-4 w-4 rounded accent-[var(--orange-deep)]"
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          </Card>

          {/* Dishes Card */}
          <Card>
            <CardHeader eyebrow="Dish Filter" title="Individual Dishes" />
            <p className="mb-4 text-xs text-[var(--muted)]">
              Checked dishes are HIDDEN from employees of this company.
            </p>

            <div className="max-h-[500px] overflow-y-auto divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)] bg-white">
              {dishesData?.data.map((dish) => {
                const isHidden = hiddenDishIds.includes(dish.id);
                return (
                  <label
                    key={dish.id}
                    className="flex cursor-pointer items-center justify-between p-3.5 hover:bg-[var(--cream-soft)] transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-[var(--navy)]">{dish.name}</span>
                      <p className="font-mono text-xs text-[var(--muted)]">{dish.sku}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isHidden ? <Badge tone="danger">Hidden</Badge> : <Badge tone="success">Visible</Badge>}
                      <input
                        type="checkbox"
                        checked={isHidden}
                        disabled={!canManage}
                        onChange={() => toggleDish(dish.id)}
                        className="h-4 w-4 rounded accent-[var(--orange-deep)]"
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
