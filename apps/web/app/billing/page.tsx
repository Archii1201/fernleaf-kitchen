'use client';

import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Checkbox } from '../../components/ui/Input';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Feedback } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge';
import { PageHeader, Toolbar } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { Table, type Column } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import {
  billableOrders,
  createInvoice,
  getInvoice,
  listInvoices,
  markInvoicePaid,
  voidInvoice,
  type BillableGroup,
  type Invoice,
  type InvoiceDetail,
} from '../../lib/api/billing';
import { useAuth } from '../../lib/auth-context';
import { formatDate, formatDateTime, rupees } from '../../lib/format';
import { useAction, useLoad } from '../../lib/use-load';

type BillingTab = 'uninvoiced' | 'invoices';

export default function BillingPage() {
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState<BillingTab>('uninvoiced');
  const [uninvoicedPage, setUninvoicedPage] = useState(1);
  const [invoicesPage, setInvoicesPage] = useState(1);

  // Selected orders for creating an invoice
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Invoice Detail Modal
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  // Dialog states
  const [confirmPaidId, setConfirmPaidId] = useState<string | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);

  // Data loading
  const {
    data: billableData,
    loading: billableLoading,
    error: billableError,
    reload: reloadBillable,
  } = useLoad(() => billableOrders(uninvoicedPage), [uninvoicedPage]);

  const {
    data: invoicesData,
    loading: invoicesLoading,
    error: invoicesError,
    reload: reloadInvoices,
  } = useLoad(() => listInvoices(invoicesPage), [invoicesPage]);

  const { run: runAction, busy: actionBusy, error: actionError, notice: actionNotice, setError: setActionError } = useAction();

  const handleToggleOrder = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handleToggleCompany = (group: BillableGroup) => {
    const groupOrderIds = group.orders.map((o) => o.id);
    const allSelected = groupOrderIds.every((id) => selectedOrderIds.has(id));

    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        groupOrderIds.forEach((id) => next.delete(id));
      } else {
        groupOrderIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleCreateInvoice = async () => {
    if (selectedOrderIds.size === 0) return;
    setActionError(null);
    const result = await runAction(
      () => createInvoice(Array.from(selectedOrderIds)),
      'Invoice created successfully!',
    );
    if (result) {
      setSelectedOrderIds(new Set());
      reloadBillable();
      reloadInvoices();
      setActiveTab('invoices');
    }
  };

  const handleOpenInvoiceDetail = async (invoiceId: string) => {
    setViewingInvoiceId(invoiceId);
    setLoadingInvoice(true);
    try {
      const detail = await getInvoice(invoiceId);
      setSelectedInvoice(detail);
    } catch {
      setSelectedInvoice(null);
    } finally {
      setLoadingInvoice(false);
    }
  };

  const handleMarkPaid = async () => {
    const id = confirmPaidId || selectedInvoice?.id;
    if (!id) return;
    setActionError(null);
    const ok = await runAction(() => markInvoicePaid(id), 'Invoice marked as paid');
    if (ok !== undefined) {
      setConfirmPaidId(null);
      if (selectedInvoice && selectedInvoice.id === id) {
        setSelectedInvoice({ ...selectedInvoice, status: 'PAID' });
      }
      reloadInvoices();
    }
  };

  const handleVoidInvoice = async () => {
    const id = confirmVoidId || selectedInvoice?.id;
    if (!id) return;
    setActionError(null);
    const ok = await runAction(() => voidInvoice(id), 'Invoice has been voided');
    if (ok !== undefined) {
      setConfirmVoidId(null);
      if (selectedInvoice && selectedInvoice.id === id) {
        setSelectedInvoice({ ...selectedInvoice, status: 'VOID' });
      }
      reloadInvoices();
    }
  };

  const invoiceColumns: Column<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      render: (inv) => <span className="font-bold text-[var(--navy)]">#{inv.invoiceNumber}</span>,
    },
    {
      key: 'company',
      header: 'Company',
      render: (inv) => <span className="font-medium text-[var(--text)]">{inv.company.name}</span>,
    },
    {
      key: 'issueDate',
      header: 'Issued',
      render: (inv) => <span className="text-[var(--muted)]">{formatDate(inv.issueDate)}</span>,
      hideBelow: 'sm',
    },
    {
      key: 'dueDate',
      header: 'Due',
      render: (inv) => <span className="text-[var(--muted)]">{formatDate(inv.dueDate)}</span>,
      hideBelow: 'md',
    },
    {
      key: 'subtotal',
      header: 'Subtotal',
      render: (inv) => <span>{rupees(inv.subtotalCents)}</span>,
      hideBelow: 'lg',
    },
    {
      key: 'credit',
      header: 'Credits',
      render: (inv) => (
        <span className={inv.creditCents > 0 ? 'text-[var(--success)] font-medium' : 'text-[var(--muted)]'}>
          {rupees(inv.creditCents)}
        </span>
      ),
      hideBelow: 'lg',
    },
    {
      key: 'total',
      header: 'Total',
      render: (inv) => <span className="font-bold text-[var(--navy)]">{rupees(inv.totalCents)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (inv) => <OrderStatusBadge status={inv.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (inv) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenInvoiceDetail(inv.id);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  const billableGroups = useMemo(() => billableData?.data ?? [], [billableData]);
  const invoicesList = useMemo(() => invoicesData?.data ?? [], [invoicesData]);

  const totalBillableOrders = billableGroups.reduce((acc, g) => acc + g.orders.length, 0);

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Finance"
        title="Billing & Invoices"
        description="Consolidate fulfilled corporate orders into invoices and track receivable balances."
        actions={
          <Button
            variant="subtle"
            icon="refresh"
            onClick={() => {
              reloadBillable();
              reloadInvoices();
            }}
            disabled={billableLoading || invoicesLoading || actionBusy}
          >
            Refresh
          </Button>
        }
      />

      <Tabs<BillingTab>
        label="Billing Sections"
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          {
            value: 'uninvoiced',
            label: 'Uninvoiced Orders',
            count: totalBillableOrders,
          },
          {
            value: 'invoices',
            label: 'Invoices',
            count: invoicesData?.meta?.total,
          },
        ]}
      />

      <Feedback error={actionError} notice={actionNotice} />

      {/* Uninvoiced Orders View */}
      {activeTab === 'uninvoiced' && (
        <div className="space-y-6">
          <Toolbar>
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              <span className="text-sm text-[var(--muted)]">
                {selectedOrderIds.size}{' '}
                {selectedOrderIds.size === 1 ? 'order' : 'orders'} selected for invoicing
              </span>
              {can('billing.manage') ? (
                <Button
                  variant="primary"
                  disabled={selectedOrderIds.size === 0 || actionBusy}
                  busy={actionBusy}
                  onClick={handleCreateInvoice}
                >
                  Generate Invoice ({selectedOrderIds.size})
                </Button>
              ) : null}
            </div>
          </Toolbar>

          {billableError ? (
            <ErrorState message={billableError} onRetry={reloadBillable} />
          ) : billableLoading ? (
            <SkeletonRows rows={6} />
          ) : billableGroups.length === 0 ? (
            <EmptyState
              icon="billing"
              title="No pending uninvoiced orders"
              hint="All fulfilled corporate catering orders have been invoiced."
            />
          ) : (
            <div className="space-y-6">
              {billableGroups.map((group) => {
                const groupOrderIds = group.orders.map((o) => o.id);
                const allSelected =
                  groupOrderIds.length > 0 &&
                  groupOrderIds.every((id) => selectedOrderIds.has(id));

                return (
                  <Card key={group.company.id} className="p-5 bg-white">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                      <div className="flex items-center gap-3">
                        {can('billing.manage') ? (
                          <Checkbox
                            label=""
                            checked={allSelected}
                            onChange={() => handleToggleCompany(group)}
                          />
                        ) : null}
                        <div>
                          <h2 className="serif text-xl font-bold text-[var(--navy)]">
                            {group.company.name}
                          </h2>
                          <p className="text-xs text-[var(--muted)]">
                            {group.orders.length} {group.orders.length === 1 ? 'order' : 'orders'} ready for billing
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                          Group Total
                        </span>
                        <p className="serif text-2xl font-bold text-[var(--navy)]">
                          {rupees(group.totalCents)}
                        </p>
                      </div>
                    </div>

                    <div className="divide-y divide-[var(--border)]/60">
                      {group.orders.map((order) => {
                        const isSelected = selectedOrderIds.has(order.id);
                        return (
                          <div
                            key={order.id}
                            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm hover:bg-[var(--cream)]/30 rounded px-2 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {can('billing.manage') ? (
                                <Checkbox
                                  label=""
                                  checked={isSelected}
                                  onChange={() => handleToggleOrder(order.id)}
                                />
                              ) : null}
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-[var(--navy)]">
                                    #{order.orderNumber}
                                  </span>
                                  <OrderStatusBadge status={order.status} />
                                </div>
                                <span className="text-xs text-[var(--muted)]">
                                  Delivered on {formatDate(order.deliveryDate)}
                                </span>
                              </div>
                            </div>

                            <span className="font-bold text-[var(--navy)]">
                              {rupees(order.totalCents)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}

              {billableData?.meta && (
                <Pagination
                  page={billableData.meta.page}
                  totalPages={billableData.meta.totalPages}
                  total={billableData.meta.total}
                  onPage={setUninvoicedPage}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Invoices List View */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {invoicesError ? (
            <ErrorState message={invoicesError} onRetry={reloadInvoices} />
          ) : invoicesLoading ? (
            <SkeletonRows rows={8} />
          ) : invoicesList.length === 0 ? (
            <EmptyState
              icon="billing"
              title="No invoices generated yet"
              hint="Select uninvoiced orders to issue your first corporate invoice."
              action={
                <Button variant="primary" onClick={() => setActiveTab('uninvoiced')}>
                  View Uninvoiced Orders
                </Button>
              }
            />
          ) : (
            <>
              <Table
                columns={invoiceColumns}
                rows={invoicesList}
                rowKey={(inv) => inv.id}
                onRowClick={(inv) => handleOpenInvoiceDetail(inv.id)}
              />

              {invoicesData?.meta && (
                <Pagination
                  page={invoicesData.meta.page}
                  totalPages={invoicesData.meta.totalPages}
                  total={invoicesData.meta.total}
                  onPage={setInvoicesPage}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Invoice Detail Modal */}
      <Modal
        open={Boolean(viewingInvoiceId)}
        title={selectedInvoice ? `Invoice #${selectedInvoice.invoiceNumber}` : 'Loading Invoice…'}
        size="lg"
        onClose={() => {
          setViewingInvoiceId(null);
          setSelectedInvoice(null);
        }}
        footer={
          selectedInvoice ? (
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <div className="flex gap-2">
                {can('billing.manage') &&
                selectedInvoice.status !== 'PAID' &&
                selectedInvoice.status !== 'VOID' ? (
                  <>
                    <Button
                      variant="navy"
                      size="sm"
                      onClick={() => setConfirmPaidId(selectedInvoice.id)}
                    >
                      Mark Paid
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setConfirmVoidId(selectedInvoice.id)}
                    >
                      Void Invoice
                    </Button>
                  </>
                ) : null}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setViewingInvoiceId(null);
                  setSelectedInvoice(null);
                }}
              >
                Close
              </Button>
            </div>
          ) : undefined
        }
      >
        {loadingInvoice || !selectedInvoice ? (
          <SkeletonRows rows={5} />
        ) : (
          <div className="space-y-6">
            {/* Header info */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
              <div>
                <p className="eyebrow text-[var(--muted)]">Recipient</p>
                <h3 className="serif text-2xl font-bold text-[var(--navy)]">
                  {selectedInvoice.company.name}
                </h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Issued on {formatDate(selectedInvoice.issueDate)} · Due by{' '}
                  {formatDate(selectedInvoice.dueDate)}
                </p>
              </div>
              <div className="text-right">
                <OrderStatusBadge status={selectedInvoice.status} />
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Generated {formatDateTime(selectedInvoice.createdAt)}
                </p>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-3.5">
                <span className="text-xs font-semibold text-[var(--muted)]">Subtotal</span>
                <p className="serif text-xl font-bold text-[var(--navy)]">
                  {rupees(selectedInvoice.subtotalCents)}
                </p>
              </div>
              <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-3.5">
                <span className="text-xs font-semibold text-[var(--muted)]">Credits Applied</span>
                <p className="serif text-xl font-bold text-[var(--success)]">
                  {rupees(selectedInvoice.creditCents)}
                </p>
              </div>
              <div className="rounded-[var(--radius-sm)] border border-[var(--navy)]/20 bg-[var(--cream)] p-3.5">
                <span className="text-xs font-semibold text-[var(--navy)]">Total Payable</span>
                <p className="serif text-xl font-bold text-[var(--navy)]">
                  {rupees(selectedInvoice.totalCents)}
                </p>
              </div>
            </div>

            {/* Line items table */}
            <div>
              <h4 className="serif text-lg font-semibold text-[var(--navy)] mb-2">
                Line Items ({selectedInvoice.lines.length})
              </h4>
              <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--ivory)] text-xs text-[var(--muted)] font-semibold border-b border-[var(--border)]">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {selectedInvoice.lines.map((line) => (
                      <tr key={line.id} className="hover:bg-[var(--cream)]/30">
                        <td className="px-3 py-2 font-medium text-xs text-[var(--muted)] uppercase">
                          {line.type}
                        </td>
                        <td className="px-3 py-2 text-[var(--text)]">
                          {line.description}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-[var(--navy)]">
                          {rupees(line.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Associated orders */}
            {selectedInvoice.orders.length > 0 && (
              <div>
                <h4 className="serif text-lg font-semibold text-[var(--navy)] mb-2">
                  Billed Orders ({selectedInvoice.orders.length})
                </h4>
                <div className="space-y-1.5">
                  {selectedInvoice.orders.map((ord) => (
                    <div
                      key={ord.id}
                      className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--ivory)] px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--navy)]">
                          #{ord.orderNumber}
                        </span>
                        <OrderStatusBadge status={ord.status} />
                      </div>
                      <span className="font-semibold text-[var(--navy)]">
                        {rupees(ord.totalCents)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm Paid Dialog */}
      <ConfirmDialog
        open={Boolean(confirmPaidId)}
        title="Mark Invoice as Paid"
        message="Confirm that full payment for this invoice has been cleared into company accounts? Status will update to PAID."
        confirmLabel="Mark as Paid"
        tone="navy"
        busy={actionBusy}
        onConfirm={handleMarkPaid}
        onCancel={() => setConfirmPaidId(null)}
      />

      {/* Confirm Void Dialog */}
      <ConfirmDialog
        open={Boolean(confirmVoidId)}
        title="Void Invoice"
        message="Are you sure you want to void this invoice? Voiding cancels all payable balances and cannot be reversed."
        confirmLabel="Void Invoice"
        tone="danger"
        busy={actionBusy}
        onConfirm={handleVoidInvoice}
        onCancel={() => setConfirmVoidId(null)}
      />
    </main>
  );
}
