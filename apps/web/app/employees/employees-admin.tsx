'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  createEmployee,
  fetchCompanies,
  fetchCompany,
  fetchEmployees,
  fetchReferenceItems,
  updateEmployee,
  type Company,
  type CompanyAddress,
  type Employee,
} from '../../lib/companies-api';

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

interface ReferenceItem {
  id: string;
  name: string;
}

export default function EmployeesAdmin() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [addresses, setAddresses] = useState<CompanyAddress[]>([]);
  const [allergens, setAllergens] = useState<ReferenceItem[]>([]);
  const [dietaryTags, setDietaryTags] = useState<ReferenceItem[]>([]);
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
      const result = await fetchEmployees({
        page,
        limit: PAGE_SIZE,
        companyId: companyId || undefined,
        search: search || undefined,
      });

      setEmployees(result.data);
      setTotal(result.meta.total);
    });
  }, [page, companyId, search, report]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void report(async () => {
      const [companyPage, allergenList, tagList] = await Promise.all([
        fetchCompanies({ page: 1, limit: 100 }),
        fetchReferenceItems('allergens'),
        fetchReferenceItems('dietary-tags'),
      ]);

      setCompanies(companyPage.data);
      setAllergens(allergenList);
      setDietaryTags(tagList);
    });
  }, [report]);

  async function loadAddressesFor(targetCompanyId: string) {
    if (!targetCompanyId) {
      setAddresses([]);

      return;
    }

    const company = await fetchCompany(targetCompanyId);

    setAddresses(company.addresses);
  }

  async function onCreate(form: FormData) {
    const created = await report(() =>
      createEmployee({
        companyId: String(form.get('companyId') ?? ''),
        email: String(form.get('email') ?? ''),
        fullName: String(form.get('fullName') ?? ''),
        defaultAddressId: String(form.get('defaultAddressId') ?? '') || undefined,
        canChooseAddress: form.get('canChooseAddress') === 'on',
        canChooseDeliveryTime: form.get('canChooseDeliveryTime') === 'on',
        canChoosePackaging: form.get('canChoosePackaging') === 'on',
        allergenIds: form.getAll('allergenIds'),
        dietaryTagIds: form.getAll('dietaryTagIds'),
      }),
    );

    if (created) {
      setStatus('Employee created.');
      await loadList();
    }
  }

  async function onUpdate(form: FormData) {
    if (!selected) {
      return;
    }

    const saved = await report(() =>
      updateEmployee(selected.id, {
        companyId: String(form.get('companyId') ?? ''),
        email: String(form.get('email') ?? ''),
        fullName: String(form.get('fullName') ?? ''),
        defaultAddressId: String(form.get('defaultAddressId') ?? '') || null,
        canChooseAddress: form.get('canChooseAddress') === 'on',
        canChooseDeliveryTime: form.get('canChooseDeliveryTime') === 'on',
        canChoosePackaging: form.get('canChoosePackaging') === 'on',
        allergenIds: form.getAll('allergenIds'),
        dietaryTagIds: form.getAll('dietaryTagIds'),
        allergyNotes: String(form.get('allergyNotes') ?? '') || null,
        dietaryNotes: String(form.get('dietaryNotes') ?? '') || null,
        active: form.get('active') === 'on',
      }),
    );

    if (saved) {
      setStatus(
        'Employee saved. Historical orders keep the company they were placed with.',
      );
      setSelected(null);
      await loadList();
    }
  }

  return (
    <section>
      {error ? <p style={{ color: '#b00' }}>{error}</p> : null}
      {status ? <p style={{ color: '#0a6' }}>{status}</p> : null}

      <div style={box}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>New employee</h2>
        <form action={onCreate} style={{ ...row, alignItems: 'flex-end' }}>
          <label>
            Company
            <br />
            <select
              name="companyId"
              required
              onChange={(event) => void loadAddressesFor(event.target.value)}
            >
              <option value="">Select</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Full name
            <br />
            <input name="fullName" required minLength={2} />
          </label>
          <label>
            Email
            <br />
            <input name="email" type="email" required />
          </label>
          <label>
            Address
            <br />
            <select name="defaultAddressId">
              <option value="">(company default)</option>
              {addresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label}
                </option>
              ))}
            </select>
          </label>
          <PermissionChecks />
          <ReferenceChecks name="allergenIds" label="Allergies" items={allergens} />
          <ReferenceChecks
            name="dietaryTagIds"
            label="Dietary"
            items={dietaryTags}
          />
          <button type="submit">Create</button>
        </form>
      </div>

      <div style={box}>
        <div style={row}>
          <select
            value={companyId}
            onChange={(event) => {
              setPage(1);
              setCompanyId(event.target.value);
            }}
          >
            <option value="">All companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search name or email"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
          <span>{total} employee{total === 1 ? '' : 's'}</span>
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
          {employees.map((employee) => (
            <li key={employee.id} style={{ padding: '0.35rem 0' }}>
              <button
                type="button"
                onClick={() => {
                  setSelected(employee);
                  void loadAddressesFor(employee.company.id);
                }}
              >
                {employee.fullName}
              </button>{' '}
              <code>{employee.email}</code>
              <span style={{ color: '#666' }}>
                {' '}
                &middot; {employee.company.name}
                {employee.ownsCompany ? ' (owner)' : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {selected ? (
        <div style={{ ...box, borderColor: '#bbb' }}>
          <h2 style={{ marginTop: 0, fontSize: '1rem' }}>
            Edit {selected.fullName}
          </h2>
          <p style={{ color: '#666' }}>
            Changing the company assignment updates this person going forward.
            Orders they already placed stay with the original company.
          </p>
          <form action={onUpdate}>
            <div style={row}>
              <label>
                Company
                <br />
                <select
                  name="companyId"
                  defaultValue={selected.company.id}
                  onChange={(event) => void loadAddressesFor(event.target.value)}
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Full name
                <br />
                <input name="fullName" defaultValue={selected.fullName} required />
              </label>
              <label>
                Email
                <br />
                <input
                  name="email"
                  type="email"
                  defaultValue={selected.email}
                  required
                />
              </label>
              <label>
                Address
                <br />
                <select
                  name="defaultAddressId"
                  defaultValue={selected.defaultAddress?.id ?? ''}
                >
                  <option value="">(none)</option>
                  {addresses.map((address) => (
                    <option key={address.id} value={address.id}>
                      {address.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ ...row, marginTop: '0.6rem' }}>
              <PermissionChecks defaults={selected.deliveryPermissions} />
              <ReferenceChecks
                name="allergenIds"
                label="Allergies"
                items={allergens}
                selectedIds={selected.allergens.map((entry) => entry.id)}
              />
              <ReferenceChecks
                name="dietaryTagIds"
                label="Dietary"
                items={dietaryTags}
                selectedIds={selected.dietaryTags.map((entry) => entry.id)}
              />
            </div>
            <div style={{ ...row, marginTop: '0.6rem' }}>
              <label>
                Allergy notes
                <br />
                <input
                  name="allergyNotes"
                  defaultValue={selected.allergyNotes ?? ''}
                />
              </label>
              <label>
                Dietary notes
                <br />
                <input
                  name="dietaryNotes"
                  defaultValue={selected.dietaryNotes ?? ''}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={selected.active}
                />{' '}
                Active
              </label>
              <button type="submit">Save</button>
              <button type="button" onClick={() => setSelected(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function PermissionChecks({
  defaults,
}: {
  defaults?: Employee['deliveryPermissions'];
}) {
  return (
    <>
      <label>
        <input
          type="checkbox"
          name="canChooseAddress"
          defaultChecked={defaults?.canChooseAddress}
        />{' '}
        Can choose address
      </label>
      <label>
        <input
          type="checkbox"
          name="canChooseDeliveryTime"
          defaultChecked={defaults?.canChooseDeliveryTime}
        />{' '}
        Can choose time
      </label>
      <label>
        <input
          type="checkbox"
          name="canChoosePackaging"
          defaultChecked={defaults?.canChoosePackaging}
        />{' '}
        Can choose packaging
      </label>
    </>
  );
}

function ReferenceChecks({
  name,
  label,
  items,
  selectedIds = [],
}: {
  name: string;
  label: string;
  items: ReferenceItem[];
  selectedIds?: string[];
}) {
  return (
    <fieldset style={{ border: '1px solid #eee', padding: '0.4rem 0.6rem' }}>
      <legend>{label}</legend>
      {items.map((item) => (
        <label key={item.id} style={{ marginRight: '0.6rem' }}>
          <input
            type="checkbox"
            name={name}
            value={item.id}
            defaultChecked={selectedIds.includes(item.id)}
          />{' '}
          {item.name}
        </label>
      ))}
    </fieldset>
  );
}
