'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { listCompanies, createCompany, type Company } from '../../lib/api/companies';
import { listTiers, type PriceTier } from '../../lib/api/pricing';
import { useAuth } from '../../lib/auth-context';
import { useAction, useLoad } from '../../lib/use-load';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, Feedback } from '../../components/ui/EmptyState';
import { Input, SearchInput } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader, Toolbar } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { Table, type Column } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

export default function CompaniesPage() {
  const router = useRouter();
  const { can } = useAuth();
  const { toast } = useToast();
  const canManage = can('companies.manage');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'true' | 'false'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Load Companies
  const {
    data: companiesData,
    loading,
    error,
    reload,
  } = useLoad(
    () =>
      listCompanies({
        page,
        limit: 15,
        search: search.trim() || undefined,
        active: activeFilter === 'all' ? undefined : activeFilter === 'true',
      }),
    [page, search, activeFilter],
  );

  // Load price tiers for modal
  const { data: tiers } = useLoad(listTiers, []);

  const columns: Column<Company>[] = [
    {
      key: 'name',
      header: 'Company Name',
      render: (company) => (
        <div>
          <p className="font-semibold text-[var(--navy)]">{company.name}</p>
          {company.owner ? (
            <p className="text-xs text-[var(--muted)]">Owner: {company.owner.fullName}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'legalName',
      header: 'Legal Name',
      hideBelow: 'md',
      render: (company) => (
        <span className="text-[var(--text)]">{company.legalName ?? '—'}</span>
      ),
    },
    {
      key: 'domains',
      header: 'Corporate Domains',
      render: (company) => (
        <div className="flex flex-wrap gap-1">
          {company.domains.length > 0 ? (
            company.domains.map((d) => (
              <span
                key={d.id}
                className="rounded bg-[var(--cream-soft)] px-2 py-0.5 font-mono text-xs text-[var(--navy)]"
              >
                @{d.domain}
              </span>
            ))
          ) : (
            <span className="text-xs text-[var(--muted)]">No domains</span>
          )}
        </div>
      ),
    },
    {
      key: 'priceTier',
      header: 'Price Tier',
      render: (company) =>
        company.priceTier ? (
          <Badge tone="orange">{company.priceTier.name}</Badge>
        ) : (
          <Badge tone="muted">Default Tier</Badge>
        ),
    },
    {
      key: 'employees',
      header: 'Employees',
      hideBelow: 'sm',
      render: (company) => (
        <span className="text-sm font-medium text-[var(--navy)]">
          {company.employeeCount} {company.employeeCount === 1 ? 'employee' : 'employees'}
        </span>
      ),
    },
    {
      key: 'active',
      header: 'Status',
      render: (company) =>
        company.active ? (
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
      render: (company) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/companies/${company.id}`);
          }}
        >
          View Details →
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        eyebrow="Customer Accounts"
        description="Corporate client accounts, verified domains, custom pricing tiers, delivery addresses, and staff receiving rules."
        actions={
          canManage ? (
            <Button icon="plus" onClick={() => setIsCreateOpen(true)}>
              New Company
            </Button>
          ) : null
        }
      />

      <Card>
        <Toolbar>
          <SearchInput
            label="Search companies"
            placeholder="Search by company name…"
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
          />
          <Select
            label="Status filter"
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value as 'all' | 'true' | 'false');
              setPage(1);
            }}
            className="w-full sm:w-44"
          >
            <option value="all">All Statuses</option>
            <option value="true">Active Only</option>
            <option value="false">Inactive Only</option>
          </Select>
        </Toolbar>

        <Feedback error={error} />

        {loading ? (
          <SkeletonRows rows={7} />
        ) : !companiesData || companiesData.data.length === 0 ? (
          <EmptyState
            title="No companies found"
            hint={
              search
                ? `No companies matched "${search}".`
                : 'No customer companies have been registered yet.'
            }
            icon="companies"
            action={
              canManage ? (
                <Button icon="plus" onClick={() => setIsCreateOpen(true)}>
                  Create First Company
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <Table
              columns={columns}
              rows={companiesData.data}
              rowKey={(c) => c.id}
              onRowClick={(c) => router.push(`/companies/${c.id}`)}
              caption="Company client directory"
            />

            <Pagination
              page={companiesData.meta.page}
              totalPages={companiesData.meta.totalPages}
              total={companiesData.meta.total}
              onPage={(p) => setPage(p)}
            />
          </>
        )}
      </Card>

      {/* Create Company Modal */}
      {isCreateOpen ? (
        <CreateCompanyModal
          open={isCreateOpen}
          tiers={tiers ?? []}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={(created) => {
            setIsCreateOpen(false);
            toast(`Created company "${created.name}".`, 'success');
            reload();
            router.push(`/companies/${created.id}`);
          }}
        />
      ) : null}
    </div>
  );
}

function CreateCompanyModal({
  open,
  tiers,
  onClose,
  onSuccess,
}: {
  open: boolean;
  tiers: PriceTier[];
  onClose: () => void;
  onSuccess: (company: Company) => void;
}) {
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [primaryDomain, setPrimaryDomain] = useState('');
  const [otherDomains, setOtherDomains] = useState('');
  const [priceTierId, setPriceTierId] = useState('');
  const [billingContactName, setBillingContactName] = useState('');
  const [billingContactEmail, setBillingContactEmail] = useState('');
  const [billingContactPhone, setBillingContactPhone] = useState('');

  const { run, busy, error } = useAction();

  const cleanDomain = (d: string) =>
    d
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/^https?:\/\//, '')
      .split('/')[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const pDom = cleanDomain(primaryDomain);
      if (!pDom || !pDom.includes('.')) {
        throw new Error('Please enter a valid corporate email domain (e.g. acme.com).');
      }

      const domainList = [pDom];
      if (otherDomains.trim()) {
        const extra = otherDomains
          .split(',')
          .map(cleanDomain)
          .filter((d) => d && d.includes('.') && !domainList.includes(d));
        domainList.push(...extra);
      }

      const payload: Record<string, unknown> = {
        name: name.trim(),
        domains: domainList,
      };

      if (legalName.trim()) payload.legalName = legalName.trim();
      if (priceTierId) payload.priceTierId = priceTierId;
      if (billingContactName.trim()) payload.billingContactName = billingContactName.trim();
      if (billingContactEmail.trim()) payload.billingContactEmail = billingContactEmail.trim();
      if (billingContactPhone.trim()) payload.billingContactPhone = billingContactPhone.trim();

      const created = await createCompany(payload);
      onSuccess(created);
    });
  };

  return (
    <Modal
      open={open}
      title="Create Company Account"
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" busy={busy} onClick={handleSubmit}>
            Create Company
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Feedback error={error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Company Name"
            placeholder="e.g. Northwind Analytics"
            hint="Display name across the kitchen and order sheets."
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Legal / Invoicing Name"
            placeholder="e.g. Northwind Solutions Pvt. Ltd."
            hint="Used on formal billing statements."
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Primary Corporate Email Domain"
            placeholder="e.g. northwind.com"
            hint="Auto-maps employees signing up with this email domain."
            value={primaryDomain}
            onChange={(e) => setPrimaryDomain(e.target.value)}
            required
          />

          <Input
            label="Additional Domains (Optional)"
            placeholder="e.g. northwind.co.in, nw-holdings.com"
            hint="Comma-separated secondary email domains."
            value={otherDomains}
            onChange={(e) => setOtherDomains(e.target.value)}
          />
        </div>

        <Select
          label="Pricing Tier"
          hint="Leave empty to inherit the standard default tier."
          value={priceTierId}
          onChange={(e) => setPriceTierId(e.target.value)}
        >
          <option value="">Default Price Tier (Inherited)</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.rule}) {t.isDefault ? '— Default' : ''}
            </option>
          ))}
        </Select>

        <div className="border-t border-[var(--border)] pt-4">
          <p className="eyebrow mb-2">Billing Contact (Optional)</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Contact Person"
              placeholder="e.g. Finance Dept"
              value={billingContactName}
              onChange={(e) => setBillingContactName(e.target.value)}
            />
            <Input
              label="Billing Email"
              type="email"
              placeholder="billing@northwind.com"
              value={billingContactEmail}
              onChange={(e) => setBillingContactEmail(e.target.value)}
            />
            <Input
              label="Phone Number"
              placeholder="+91 98765 43210"
              value={billingContactPhone}
              onChange={(e) => setBillingContactPhone(e.target.value)}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
