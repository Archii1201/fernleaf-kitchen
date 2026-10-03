'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addCompanyAddress,
  addCompanyDomain,
  addCompanyHoliday,
  createCompany,
  fetchCompanies,
  fetchCompany,
  fetchCompanyCalendar,
  fetchEligibleDrivers,
  fetchEmployees,
  fetchMenuVisibility,
  removeCompanyDomain,
  removeCompanyHoliday,
  replaceCompanyCalendar,
  replaceMenuVisibility,
  retireCompanyAddress,
  updateCompany,
  updateCompanyPriceTier,
  updateDeliveryDefaults,
  WEEKDAYS,
  type Company,
  type CompanyCalendar,
  type Employee,
  type MenuVisibility,
} from '../../lib/companies-api';
import { fetchPriceTiers, type PriceTier } from '../../lib/pricing-api';

const PAGE_SIZE = 20;

const box: React.CSSProperties = {
  border: '1px solid #e3e3e3',
  borderRadius: '6px',
  padding: '0.9rem',
  marginBottom: '1rem',
};

const row: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'center',
  flexWrap: 'wrap',
};

export default function CompaniesAdmin() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [company, setCompany] = useState<Company | null>(null);
  const [calendar, setCalendar] = useState<CompanyCalendar | null>(null);
  const [visibility, setVisibility] = useState<MenuVisibility | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [drivers, setDrivers] = useState<
    { id: string; staffCode: string; fullName: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const report = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action();
      setError(null);

      return true;
    } catch (actionError) {
      setError((actionError as Error).message);

      return false;
    }
  }, []);

  const loadList = useCallback(async () => {
    await report(async () => {
      const result = await fetchCompanies({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
      });

      setCompanies(result.data);
      setTotal(result.meta.total);
    });
  }, [page, search, report]);

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setCompany(null);

      return;
    }

    await report(async () => {
      const [detail, companyCalendar, menu, staff] = await Promise.all([
        fetchCompany(selectedId),
        fetchCompanyCalendar(selectedId),
        fetchMenuVisibility(selectedId),
        fetchEmployees({ page: 1, limit: 100, companyId: selectedId }),
      ]);

      setCompany(detail);
      setCalendar(companyCalendar);
      setVisibility(menu);
      setEmployees(staff.data);
    });
  }, [selectedId, report]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    void report(async () => {
      const [loadedTiers, loadedDrivers] = await Promise.all([
        fetchPriceTiers(),
        fetchEligibleDrivers(),
      ]);

      setTiers(loadedTiers);
      setDrivers(loadedDrivers);
    });
  }, [report]);

  async function onCreate(form: FormData) {
    const domains = String(form.get('domains') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const created = await report(() =>
      createCompany({
        name: String(form.get('name') ?? ''),
        priceTierId: String(form.get('priceTierId') ?? ''),
        domains,
        billingContactName:
          String(form.get('billingContactName') ?? '') || undefined,
        billingContactEmail:
          String(form.get('billingContactEmail') ?? '') || undefined,
      }),
    );

    if (created) {
      setStatus('Company created.');
      await loadList();
    }
  }

  return (
    <section>
      {error ? <p style={{ color: '#b00' }}>{error}</p> : null}
      {status ? <p style={{ color: '#0a6' }}>{status}</p> : null}

      <div style={box}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>New company</h2>
        <form
          action={onCreate}
          style={{ ...row, alignItems: 'flex-end' }}
        >
          <label>
            Name
            <br />
            <input name="name" required minLength={2} />
          </label>
          <label>
            Email domains (comma separated)
            <br />
            <input name="domains" placeholder="northwind.com" required />
          </label>
          <label>
            Price tier
            <br />
            <select name="priceTierId" required>
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Billing contact
            <br />
            <input name="billingContactName" />
          </label>
          <label>
            Billing email
            <br />
            <input name="billingContactEmail" type="email" />
          </label>
          <button type="submit">Create</button>
        </form>
      </div>

      <div style={box}>
        <div style={row}>
          <input
            type="search"
            placeholder="Search name or domain"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
          <span>{total} compan{total === 1 ? 'y' : 'ies'}</span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page * PAGE_SIZE >= total}
          >
            Next
          </button>
        </div>

        <ul style={{ listStyle: 'none', padding: 0 }}>
          {companies.map((entry) => (
            <li key={entry.id} style={{ padding: '0.3rem 0' }}>
              <label style={row}>
                <input
                  type="radio"
                  name="company"
                  checked={entry.id === selectedId}
                  onChange={() => setSelectedId(entry.id)}
                />
                <strong>{entry.name}</strong>
                <span style={{ color: '#666' }}>
                  {entry.domains.map((domain) => domain.domain).join(', ')}
                </span>
                <span style={{ color: '#888' }}>
                  {entry.priceTier.name} &middot; {entry.employeeCount} employees
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {company ? (
        <CompanyDetail
          company={company}
          calendar={calendar}
          visibility={visibility}
          employees={employees}
          tiers={tiers}
          drivers={drivers}
          onChanged={async (message) => {
            setStatus(message);
            await Promise.all([loadDetail(), loadList()]);
          }}
          onError={setError}
        />
      ) : null}
    </section>
  );
}

function CompanyDetail({
  company,
  calendar,
  visibility,
  employees,
  tiers,
  drivers,
  onChanged,
  onError,
}: {
  company: Company;
  calendar: CompanyCalendar | null;
  visibility: MenuVisibility | null;
  employees: Employee[];
  tiers: PriceTier[];
  drivers: { id: string; staffCode: string; fullName: string }[];
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  async function run(message: string, action: () => Promise<unknown>) {
    try {
      await action();
      await onChanged(message);
    } catch (actionError) {
      onError((actionError as Error).message);
    }
  }

  const workingDays = new Set(calendar?.workingDays ?? []);

  return (
    <div style={{ ...box, borderColor: '#bbb' }}>
      <h2 style={{ marginTop: 0 }}>{company.name}</h2>

      <h3 style={{ fontSize: '0.95rem' }}>Details and billing contact</h3>
      <form
        action={(form) =>
          run('Company updated.', () =>
            updateCompany(company.id, {
              name: String(form.get('name') ?? ''),
              billingContactName:
                String(form.get('billingContactName') ?? '') || undefined,
              billingContactEmail:
                String(form.get('billingContactEmail') ?? '') || undefined,
              billingContactPhone:
                String(form.get('billingContactPhone') ?? '') || undefined,
              ownerEmployeeId:
                String(form.get('ownerEmployeeId') ?? '') || undefined,
            }),
          )
        }
        style={row}
      >
        <input name="name" defaultValue={company.name} />
        <input
          name="billingContactName"
          placeholder="Billing contact"
          defaultValue={company.billingContact.name ?? ''}
        />
        <input
          name="billingContactEmail"
          type="email"
          placeholder="Billing email"
          defaultValue={company.billingContact.email ?? ''}
        />
        <input
          name="billingContactPhone"
          placeholder="Billing phone"
          defaultValue={company.billingContact.phone ?? ''}
        />
        <label>
          Owner
          <select name="ownerEmployeeId" defaultValue={company.owner?.id ?? ''}>
            <option value="">(none)</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Save</button>
      </form>

      <h3 style={{ fontSize: '0.95rem' }}>Email domains</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {company.domains.map((domain) => (
          <li key={domain.id} style={row}>
            <code>{domain.domain}</code>
            <button
              type="button"
              onClick={() =>
                run('Domain removed.', () =>
                  removeCompanyDomain(company.id, domain.id),
                )
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        action={(form) =>
          run('Domain added.', () =>
            addCompanyDomain(company.id, String(form.get('domain') ?? '')),
          )
        }
        style={row}
      >
        <input name="domain" placeholder="acme.com" required />
        <button type="submit">Add domain</button>
      </form>

      <h3 style={{ fontSize: '0.95rem' }}>Delivery addresses</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {company.addresses.map((address) => (
          <li key={address.id} style={row}>
            <strong>{address.label}</strong>
            <span>
              {address.line1}, {address.city} {address.postalCode}
            </span>
            <button
              type="button"
              onClick={() =>
                run('Address retired.', () =>
                  retireCompanyAddress(company.id, address.id),
                )
              }
            >
              Retire
            </button>
          </li>
        ))}
      </ul>
      <form
        action={(form) =>
          run('Address added.', () =>
            addCompanyAddress(company.id, {
              label: String(form.get('label') ?? ''),
              line1: String(form.get('line1') ?? ''),
              city: String(form.get('city') ?? ''),
              postalCode: String(form.get('postalCode') ?? ''),
            }),
          )
        }
        style={row}
      >
        <input name="label" placeholder="Label" required />
        <input name="line1" placeholder="Address line 1" required />
        <input name="city" placeholder="City" required />
        <input name="postalCode" placeholder="Postal code" required />
        <button type="submit">Add address</button>
      </form>

      <h3 style={{ fontSize: '0.95rem' }}>
        Receiving calendar{' '}
        <small style={{ fontWeight: 400, color: '#777' }}>
          (when this company can receive, not the kitchen cutoff calendar)
        </small>
      </h3>
      <form
        action={(form) =>
          run('Calendar saved.', () =>
            replaceCompanyCalendar(
              company.id,
              WEEKDAYS.filter((weekday) => form.get(weekday) === 'on'),
            ),
          )
        }
        style={row}
      >
        {WEEKDAYS.map((weekday) => (
          <label key={weekday} style={{ marginRight: '0.4rem' }}>
            <input
              type="checkbox"
              name={weekday}
              defaultChecked={workingDays.has(weekday)}
            />{' '}
            {weekday.slice(0, 3)}
          </label>
        ))}
        <button type="submit">Save calendar</button>
      </form>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {(calendar?.holidays ?? []).map((holiday) => (
          <li key={holiday.id} style={row}>
            {holiday.date} {holiday.name ?? ''}
            <button
              type="button"
              onClick={() =>
                run('Holiday removed.', () =>
                  removeCompanyHoliday(company.id, holiday.id),
                )
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        action={(form) =>
          run('Holiday added.', () =>
            addCompanyHoliday(company.id, {
              date: String(form.get('date') ?? ''),
              name: String(form.get('holidayName') ?? '') || undefined,
            }),
          )
        }
        style={row}
      >
        <input name="date" type="date" required />
        <input name="holidayName" placeholder="Name" />
        <button type="submit">Add holiday</button>
      </form>

      <h3 style={{ fontSize: '0.95rem' }}>Delivery defaults</h3>
      <form
        action={(form) =>
          run('Delivery defaults saved.', () =>
            updateDeliveryDefaults(company.id, {
              defaultAddressId:
                String(form.get('defaultAddressId') ?? '') || undefined,
              defaultDeliveryTime:
                String(form.get('defaultDeliveryTime') ?? '') || undefined,
              leaveKitchenMinutes: Number(form.get('leaveKitchenMinutes')),
              driverInstructions:
                String(form.get('driverInstructions') ?? '') || undefined,
              defaultDriverStaffId:
                String(form.get('defaultDriverStaffId') ?? '') || null,
            }),
          )
        }
        style={row}
      >
        <label>
          Default address
          <select
            name="defaultAddressId"
            defaultValue={company.deliveryDefaults.defaultAddressId ?? ''}
          >
            <option value="">(none)</option>
            {company.addresses.map((address) => (
              <option key={address.id} value={address.id}>
                {address.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Delivery time
          <input
            name="defaultDeliveryTime"
            placeholder="12:30"
            defaultValue={company.deliveryDefaults.defaultDeliveryTime ?? ''}
          />
        </label>
        <label>
          Leave kitchen (min)
          <input
            name="leaveKitchenMinutes"
            type="number"
            min={0}
            defaultValue={company.deliveryDefaults.leaveKitchenMinutes}
          />
        </label>
        <label>
          Driver instructions
          <input
            name="driverInstructions"
            defaultValue={company.deliveryDefaults.driverInstructions ?? ''}
          />
        </label>
        <label>
          Default driver
          <select
            name="defaultDriverStaffId"
            defaultValue={company.deliveryDefaults.defaultDriver?.id ?? ''}
          >
            <option value="">(none)</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.fullName} ({driver.staffCode})
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Save defaults</button>
      </form>

      <h3 style={{ fontSize: '0.95rem' }}>Price tier</h3>
      <form
        action={(form) =>
          run('Price tier assigned.', () =>
            updateCompanyPriceTier(
              company.id,
              String(form.get('priceTierId') ?? ''),
            ),
          )
        }
        style={row}
      >
        <select name="priceTierId" defaultValue={company.priceTier.id}>
          {tiers.map((tier) => (
            <option key={tier.id} value={tier.id}>
              {tier.name} ({tier.rule})
            </option>
          ))}
        </select>
        <button type="submit">Assign tier</button>
      </form>

      <h3 style={{ fontSize: '0.95rem' }}>Hidden menu items</h3>
      <p style={{ color: '#666' }}>
        Hidden categories:{' '}
        {visibility?.hiddenCategories.map((entry) => entry.name).join(', ') ||
          'none'}
        {' | '}
        Hidden dishes:{' '}
        {visibility?.hiddenDishes.map((entry) => entry.name).join(', ') ||
          'none'}
      </p>
      <form
        action={(form) =>
          run('Menu visibility saved.', () =>
            replaceMenuVisibility(company.id, {
              hiddenCategoryIds: splitIds(form.get('hiddenCategoryIds')),
              hiddenDishIds: splitIds(form.get('hiddenDishIds')),
            }),
          )
        }
        style={row}
      >
        <input
          name="hiddenCategoryIds"
          placeholder="Hidden category ids (comma separated)"
          defaultValue={(visibility?.hiddenCategories ?? [])
            .map((entry) => entry.id)
            .join(',')}
          style={{ width: '20rem' }}
        />
        <input
          name="hiddenDishIds"
          placeholder="Hidden dish ids (comma separated)"
          defaultValue={(visibility?.hiddenDishes ?? [])
            .map((entry) => entry.id)
            .join(',')}
          style={{ width: '20rem' }}
        />
        <button type="submit">Save visibility</button>
      </form>

      <h3 style={{ fontSize: '0.95rem' }}>Employees ({employees.length})</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {employees.map((employee) => (
          <li key={employee.id}>
            {employee.fullName} &mdash; <code>{employee.email}</code>
            {employee.ownsCompany ? ' (owner)' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

function splitIds(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
