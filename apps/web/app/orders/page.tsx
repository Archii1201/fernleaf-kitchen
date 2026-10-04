'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, LinkButton } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PageHeader, Toolbar } from '../../components/ui/PageHeader';
import { Table, type Column } from '../../components/ui/Table';
import { Pagination } from '../../components/ui/Pagination';
import { SearchInput } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge';
import {
  listOrders,
  ORDER_STATUSES,
  type OrderListItem,
} from '../../lib/api/orders';
import { listCompanies } from '../../lib/api/companies';
import { useAuth } from '../../lib/auth-context';
import { useLoad } from '../../lib/use-load';
import { formatDate, rupees, todayIso } from '../../lib/format';

export default function OrdersPage() {
  const router = useRouter();
  const { can } = useAuth();
  const canEdit = can('orders.edit');

  // Filter States
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [invoicedFilter, setInvoicedFilter] = useState<string>('');
  const [dateMode, setDateMode] = useState<'all' | 'today' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>('');

  const today = todayIso();
  const effectiveDate =
    dateMode === 'today' ? today : dateMode === 'custom' && customDate ? customDate : undefined;

  // Companies for Filter Selector
  const { data: companiesData } = useLoad(() => listCompanies({ limit: 100 }), ['orders-companies']);
  const companies = companiesData?.data ?? [];

  // Orders Paginated Loader
  const {
    data: ordersData,
    loading,
    error,
    reload,
  } = useLoad(
    () =>
      listOrders({
        page,
        limit: 20,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        companyId: companyFilter || undefined,
        invoiced:
          invoicedFilter === 'true' ? true : invoicedFilter === 'false' ? false : undefined,
        date: effectiveDate,
      }),
    [page, search, statusFilter, companyFilter, invoicedFilter, effectiveDate],
  );

  const orders = ordersData?.data ?? [];
  const meta = ordersData?.meta;

  const hasActiveFilters =
    Boolean(search) ||
    Boolean(statusFilter) ||
    Boolean(companyFilter) ||
    Boolean(invoicedFilter) ||
    dateMode !== 'all';

  const resetFilters = () => {
    setPage(1);
    setSearch('');
    setStatusFilter('');
    setCompanyFilter('');
    setInvoicedFilter('');
    setDateMode('all');
    setCustomDate('');
  };

  const columns: Column<OrderListItem>[] = [
    {
      key: 'orderNumber',
      header: 'Order #',
      render: (order) => (
        <span className="font-mono font-semibold text-[var(--navy)]">{order.orderNumber}</span>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      render: (order) => <span className="font-medium text-[var(--navy)]">{order.company.name}</span>,
    },
    {
      key: 'employee',
      header: 'Employee',
      render: (order) => (
        <div>
          <p className="font-medium text-[var(--navy)]">{order.employee.fullName}</p>
          <p className="text-xs text-[var(--muted)]">{order.employee.email}</p>
        </div>
      ),
    },
    {
      key: 'deliveryDate',
      header: 'Delivery Date',
      render: (order) => <span>{formatDate(order.deliveryDate)}</span>,
    },
    {
      key: 'deliveryTime',
      header: 'Time',
      render: (order) => <span className="font-mono text-xs text-[var(--muted)]">{order.deliveryTime}</span>,
      hideBelow: 'sm',
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => <OrderStatusBadge status={order.status} />,
    },
    {
      key: 'subtotal',
      header: 'Subtotal',
      render: (order) => <span className="text-[var(--muted)]">{rupees(order.subtotalCents)}</span>,
      hideBelow: 'md',
    },
    {
      key: 'total',
      header: 'Total',
      render: (order) => (
        <span className="font-semibold text-[var(--navy)]">{rupees(order.totalCents)}</span>
      ),
    },
    {
      key: 'invoiced',
      header: 'Invoiced',
      render: (order) =>
        order.invoiced ? (
          <Badge tone="success" dot>
            Invoiced
          </Badge>
        ) : (
          <Badge tone="muted">Uninvoiced</Badge>
        ),
      hideBelow: 'lg',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Orders"
        description="Monitor, inspect, and fulfill employee meal orders across client companies and delivery schedules."
        actions={
          canEdit ? (
            <LinkButton href="/orders/new" variant="primary" icon="plus">
              New Order
            </LinkButton>
          ) : null
        }
      />

      {/* FILTERS TOOLBAR */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
        <Toolbar>
          <div className="flex-1 min-w-[220px]">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search order #, customer…"
              label="Search orders"
            />
          </div>

          <div className="min-w-[160px]">
            <Select
              label="Company"
              value={companyFilter}
              onChange={(e) => {
                setCompanyFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-[150px]">
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-[140px]">
            <Select
              label="Delivery Date"
              value={dateMode}
              onChange={(e) => {
                setDateMode(e.target.value as 'all' | 'today' | 'custom');
                setPage(1);
              }}
            >
              <option value="all">All Dates</option>
              <option value="today">Today ({formatDate(today)})</option>
              <option value="custom">Specific Date…</option>
            </Select>
          </div>

          {dateMode === 'custom' ? (
            <div className="min-w-[140px]">
              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold text-[var(--navy)]">Date</span>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => {
                    setCustomDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--orange)]"
                />
              </label>
            </div>
          ) : null}

          <div className="min-w-[130px]">
            <Select
              label="Billing Status"
              value={invoicedFilter}
              onChange={(e) => {
                setInvoicedFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value="true">Invoiced only</option>
              <option value="false">Uninvoiced only</option>
            </Select>
          </div>

          {hasActiveFilters ? (
            <div className="flex items-end pb-0.5">
              <Button variant="ghost" size="md" onClick={resetFilters}>
                Reset
              </Button>
            </div>
          ) : null}
        </Toolbar>
      </div>

      {/* TABLE / CONTENT */}
      {loading ? (
        <SkeletonRows rows={8} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon="orders"
          title="No orders found"
          hint={
            hasActiveFilters
              ? 'No orders matched your current filters. Try resetting the filters.'
              : 'There are no customer orders in the system yet.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="ghost" onClick={resetFilters}>
                Clear Filters
              </Button>
            ) : canEdit ? (
              <LinkButton href="/orders/new" variant="primary" icon="plus">
                Create First Order
              </LinkButton>
            ) : null
          }
        />
      ) : (
        <div className="space-y-4">
          <Table
            columns={columns}
            rows={orders}
            rowKey={(order) => order.id}
            onRowClick={(order) => router.push(`/orders/${order.id}`)}
            caption="Customer Orders List"
          />

          {meta ? (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              onPage={setPage}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
