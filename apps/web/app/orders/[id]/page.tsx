'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardHeader } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Modal } from '../../../components/ui/Modal';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { ErrorState, Feedback } from '../../../components/ui/EmptyState';
import { OrderStatusBadge } from '../../../components/orders/OrderStatusBadge';
import { OrderTimeline } from '../../../components/orders/OrderTimeline';
import { OrderItemCard } from '../../../components/orders/OrderItemCard';
import { OrderCombinationEditor } from '../../../components/orders/OrderCombinationEditor';
import { combinationInput } from '../../../lib/order-combinations';
import {
  getOrder,
  replaceOrderLines,
  type OrderLineInput,
  placeOrder,
  cancelOrder,
  rejectOrder,
  adminDeliveryTime,
  adminAddress,
  adminPackaging,
} from '../../../lib/api/orders';
import { createCredit } from '../../../lib/api/billing';
import { getCompany, type Company } from '../../../lib/api/companies';
import { listRefs } from '../../../lib/api/catalogue';
import { useAuth } from '../../../lib/auth-context';
import { useLoad, useAction } from '../../../lib/use-load';
import { formatDate, formatDateTime, rupees, rupeesToCents } from '../../../lib/format';

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  const { can } = useAuth();
  const canEdit = can('orders.edit');
  const canConfirm = can('orders.confirm');
  const canOverride = can('orders.override');
  const canCredit = can('billing.manage');

  const action = useAction();

  // Load Order Details
  const {
    data: order,
    loading,
    error,
    reload,
  } = useLoad(() => getOrder(orderId), ['order-detail', orderId]);

  // Load Company details for addresses when overriding address
  const { data: companyDetails } = useLoad(
    () => (order?.company?.id ? getCompany(order.company.id) : Promise.resolve(null as Company | null)),
    ['order-company-addresses', order?.company?.id],
  );

  // Load packaging types for packaging override
  const { data: packagingTypes } = useLoad(
    () => listRefs('packaging-types'),
    ['packaging-types-list'],
  );

  // Modal States
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const [overrideTimeModalOpen, setOverrideTimeModalOpen] = useState(false);
  const [newDeliveryTime, setNewDeliveryTime] = useState('');

  const [overrideAddressModalOpen, setOverrideAddressModalOpen] = useState(false);
  const [newAddressId, setNewAddressId] = useState('');

  const [overridePackagingModalOpen, setOverridePackagingModalOpen] = useState(false);
  const [newPackagingTypeId, setNewPackagingTypeId] = useState('');

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [editLines, setEditLines] = useState<OrderLineInput[] | null>(null);
  const [editVersion, setEditVersion] = useState(0);

  const handleSaveLines = async () => {
    if (!order || !editLines) return;
    const saved = await action.run(
      () => replaceOrderLines(order.id, editVersion, editLines), 'Order combinations updated');
    if (saved) {
      setEditLines(null);
      reload();
    }
  };

  // Handlers
  const handlePlaceOrder = async () => {
    if (!order) return;
    await action.run(async () => {
      await placeOrder(order.id);
      reload();
    }, 'Order placed successfully');
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    const res = await action.run(async () => {
      await cancelOrder(order.id);
      reload();
    }, 'Order cancelled');
    if (res !== undefined) {
      setCancelModalOpen(false);
    }
  };

  const handleRejectOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    const res = await action.run(async () => {
      await rejectOrder(order.id, rejectReason.trim() || undefined);
      reload();
    }, 'Order rejected');
    if (res !== undefined) {
      setRejectModalOpen(false);
      setRejectReason('');
    }
  };

  const handleOverrideTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !newDeliveryTime) return;
    const res = await action.run(async () => {
      await adminDeliveryTime(order.id, newDeliveryTime, order.version);
      reload();
    }, 'Delivery time updated');
    if (res !== undefined) {
      setOverrideTimeModalOpen(false);
    }
  };

  const handleOverrideAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !newAddressId) return;
    const res = await action.run(async () => {
      await adminAddress(order.id, newAddressId, order.version);
      reload();
    }, 'Delivery address updated');
    if (res !== undefined) {
      setOverrideAddressModalOpen(false);
    }
  };

  const handleOverridePackaging = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !newPackagingTypeId) return;
    const res = await action.run(async () => {
      await adminPackaging(order.id, newPackagingTypeId, order.version);
      reload();
    }, 'Packaging type updated');
    if (res !== undefined) {
      setOverridePackagingModalOpen(false);
    }
  };

  const handleCreateCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    const cents = rupeesToCents(creditAmount);
    if (!cents || cents <= 0) {
      action.setError('Please enter a valid credit amount in rupees');
      return;
    }
    if (!creditReason.trim()) {
      action.setError('A reason for the credit is required');
      return;
    }

    const res = await action.run(async () => {
      await createCredit(order.id, {
        amountCents: cents,
        reason: creditReason.trim(),
        invoiceId: order.invoice?.id,
      });
      reload();
    }, 'Credit note issued successfully');

    if (res !== undefined) {
      setCreditModalOpen(false);
      setCreditAmount('');
      setCreditReason('');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading Order…" eyebrow="Operations" />
        <SkeletonRows rows={8} />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-6">
        <PageHeader title="Order Not Found" eyebrow="Operations" />
        <ErrorState message={error ?? 'Order could not be loaded.'} onRetry={reload} />
        <Button variant="ghost" onClick={() => router.push('/orders')}>
          Back to Orders
        </Button>
      </div>
    );
  }

  const isDraft = order.status === 'DRAFT';
  const isPlaced = order.status === 'PLACED';
  const isCancellable = isDraft || isPlaced;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <PageHeader
        eyebrow={`${order.company.name} · Created ${formatDateTime(order.createdAt)}`}
        title={`Order #${order.orderNumber}`}
        description={`Customer attendee: ${order.employee.fullName} (${order.employee.email})`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => router.push('/orders')}>
              All Orders
            </Button>

            <OrderStatusBadge status={order.status} />
            {canEdit && !order.invoice && ['DRAFT', 'PLACED', 'CONFIRMED'].includes(order.status) ? (
              <Button variant="ghost" onClick={() => {
                setEditVersion(order.version);
                setEditLines(order.lines.map((line) => ({
                  dishId: line.dishId, quantity: line.quantity,
                  notes: line.notes ?? undefined,
                  combinations: line.combinations.map(combinationInput),
                })));
              }}>Edit Combinations</Button>
            ) : null}

            {/* DRAFT ACTIONS */}
            {isDraft && canEdit ? (
              <Button variant="primary" busy={action.busy} onClick={handlePlaceOrder}>
                Place Order
              </Button>
            ) : null}

            {/* PLACED ACTIONS */}
            {isPlaced && canConfirm ? (
              <Button
                variant="danger"
                busy={action.busy}
                onClick={() => {
                  setRejectReason('');
                  setRejectModalOpen(true);
                }}
              >
                Reject Order
              </Button>
            ) : null}

            {/* CANCELLATION */}
            {isCancellable && canEdit ? (
              <Button
                variant="ghost"
                className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                onClick={() => setCancelModalOpen(true)}
              >
                Cancel Order
              </Button>
            ) : null}

            {/* BILLING CREDIT */}
            {canCredit ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setCreditAmount('');
                  setCreditReason('');
                  setCreditModalOpen(true);
                }}
              >
                Add Credit
              </Button>
            ) : null}
          </div>
        }
      />

      <Modal open={editLines !== null} title="Edit Order Combinations" size="lg"
        onClose={() => setEditLines(null)} footer={
          <Button variant="primary" busy={action.busy} onClick={handleSaveLines}>Save Combinations</Button>
        }>
        <Feedback error={action.error} />
        <p className="mb-4 text-sm">Started preparations cannot be changed. Unchanged combinations retain their ordered prices.</p>
        {editLines?.map((line, index) => (
          <div key={`${line.dishId}-${index}`} className="mb-6 space-y-3">
            <h3 className="font-semibold">{order.lines.find((current) => current.dishId === line.dishId)?.name}</h3>
            <Input label="Line quantity" type="number" min={1} step={1} value={line.quantity}
              onChange={(event) => setEditLines((current) => current?.map((item, i) => i === index
                ? { ...item, quantity: Number(event.target.value) } : item) ?? null)} />
            <OrderCombinationEditor dishId={line.dishId} quantity={line.quantity} combinations={line.combinations}
              onChange={(combinations) => setEditLines((current) => current?.map((item, i) =>
                i === index ? { ...item, combinations } : item) ?? null)} />
          </div>
        ))}
      </Modal>

      <Feedback error={action.error} notice={action.notice} />

      {/* ADMIN OVERRIDES TOOLBAR */}
      {canOverride ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] px-4 py-2.5 text-xs">
          <span className="font-semibold text-[var(--navy)]">Admin Overrides:</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setNewDeliveryTime(order.delivery.time);
              setOverrideTimeModalOpen(true);
            }}
          >
            Change Time
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setNewAddressId(order.delivery.address.id ?? '');
              setOverrideAddressModalOpen(true);
            }}
          >
            Change Address
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOverridePackagingModalOpen(true);
            }}
          >
            Change Packaging
          </Button>
        </div>
      ) : null}

      {/* MAIN TWO-COLUMN CONTENT */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN: LINES & DETAILS (2 COLS) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Order Items */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h2 className="serif text-2xl font-semibold text-[var(--navy)]">
                Order Items ({order.lines.length})
              </h2>
              <span className="text-sm font-semibold text-[var(--orange-deep)]">
                Subtotal: {rupees(order.subtotalCents)}
              </span>
            </div>

            <div className="space-y-4">
              {order.lines.map((line) => (
                <OrderItemCard key={line.id} line={line} />
              ))}
            </div>
          </section>

          {/* Prep Units Breakdown (if any) */}
          {order.prepUnits && order.prepUnits.length > 0 ? (
            <Card>
              <CardHeader
                eyebrow="Kitchen Operations"
                title="Preparation Units"
                action={
                  ['CONFIRMED', 'IN_KITCHEN', 'READY'].includes(order.status) && can('kitchen.view') ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/kitchen?date=${order.delivery.date}`)}
                    >
                      View on Kitchen Board
                    </Button>
                  ) : null
                }
              />
              <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--ivory)]">
                      <th className="eyebrow px-3 py-2 text-xs">Station</th>
                      <th className="eyebrow px-3 py-2 text-xs">Dish</th>
                      <th className="eyebrow px-3 py-2 text-xs">Qty</th>
                      <th className="eyebrow px-3 py-2 text-xs">Prep Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.prepUnits.map((u) => (
                      <tr key={u.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{u.kitchenStationCode}</td>
                        <td className="px-3 py-2 font-medium text-[var(--navy)]">{u.dishName}</td>
                        <td className="px-3 py-2">{u.quantity}</td>
                        <td className="px-3 py-2">
                          <OrderStatusBadge status={u.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {/* Customer Notes */}
          {order.customerNotes ? (
            <Card>
              <CardHeader eyebrow="Instructions" title="Customer & Kitchen Notes" />
              <p className="rounded-[var(--radius-sm)] bg-[var(--ivory)] p-3 text-sm text-[var(--text)] italic">
                “{order.customerNotes}”
              </p>
            </Card>
          ) : null}
        </div>

        {/* RIGHT COLUMN: SIDEBAR METRICS & TIMELINE (1 COL) */}
        <div className="space-y-6">
          {/* Order Financial Totals */}
          <Card className="bg-[var(--ivory)]">
            <CardHeader eyebrow="Summary" title="Financials" />
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Subtotal</span>
                <span className="font-medium text-[var(--navy)]">{rupees(order.subtotalCents)}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-2">
                <span className="serif font-semibold text-lg text-[var(--navy)]">Order Total</span>
                <span className="serif text-2xl font-bold text-[var(--orange-deep)]">
                  {rupees(order.totalCents)}
                </span>
              </div>

              <div className="border-t border-[var(--border)] pt-3 flex items-center justify-between">
                <span className="text-xs text-[var(--muted)]">Invoice Status</span>
                {order.invoice ? (
                  <Badge tone="success" dot>
                    Invoice #{order.invoice.invoiceNumber}
                  </Badge>
                ) : (
                  <Badge tone="muted">Not Invoiced</Badge>
                )}
              </div>
            </div>
          </Card>

          {/* Delivery Card */}
          <Card>
            <CardHeader eyebrow="Logistics" title="Delivery Schedule" />
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-[var(--muted)]">Delivery Date & Time</p>
                <p className="font-semibold text-[var(--navy)]">
                  {formatDate(order.delivery.date)} at {order.delivery.time}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--muted)]">Packaging Type</p>
                <p className="font-medium text-[var(--navy)]">
                  {order.delivery.packagingTypeName ?? 'Standard Packaging'}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--muted)]">Kitchen Departure Buffer</p>
                <p className="text-xs text-[var(--text)]">
                  {order.delivery.leaveKitchenMinutes} minutes before scheduled drop
                </p>
              </div>

              <div className="border-t border-[var(--border)] pt-2">
                <p className="text-xs text-[var(--muted)]">Delivery Destination</p>
                <p className="font-semibold text-[var(--navy)]">{order.delivery.address.label ?? 'Corporate Address'}</p>
                <p className="text-xs text-[var(--muted)]">{order.delivery.address.line1}</p>
                {order.delivery.address.line2 ? (
                  <p className="text-xs text-[var(--muted)]">{order.delivery.address.line2}</p>
                ) : null}
                <p className="text-xs text-[var(--muted)]">
                  {order.delivery.address.city}, {order.delivery.address.state ?? ''}{' '}
                  {order.delivery.address.postalCode}
                </p>
              </div>
            </div>
          </Card>

          {/* Attendee & Account Card */}
          <Card>
            <CardHeader eyebrow="Customer" title="Account Details" />
            <div className="space-y-2 text-sm">
              <div>
                <p className="font-semibold text-[var(--navy)]">{order.employee.fullName}</p>
                <p className="text-xs text-[var(--muted)]">{order.employee.email}</p>
              </div>
              <div className="border-t border-[var(--border)] pt-2">
                <p className="text-xs text-[var(--muted)]">Client Organization</p>
                <p className="font-medium text-[var(--navy)]">{order.company.name}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Applied Price Tier</p>
                <Badge tone="orange">{order.priceTier.name}</Badge>
              </div>
            </div>
          </Card>

          {/* Order Event Timeline */}
          <Card>
            <CardHeader eyebrow="Audit Trail" title="Timeline Events" />
            <OrderTimeline events={order.events} />
          </Card>
        </div>
      </div>

      {/* REJECT ORDER MODAL */}
      <Modal
        open={rejectModalOpen}
        title={`Reject Order #${order.orderNumber}`}
        onClose={() => setRejectModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={action.busy}
              onClick={(e) => void handleRejectOrder(e)}
            >
              Confirm Rejection
            </Button>
          </>
        }
      >
        <form onSubmit={handleRejectOrder} className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            Please supply a reason for rejecting this placed order. The customer employee will be informed.
          </p>
          <Textarea
            label="Rejection Reason"
            placeholder="e.g. Past kitchen preparation cutoff, ingredient unavailable…"
            value={rejectReason}
            required
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </form>
      </Modal>

      {/* CANCEL ORDER MODAL */}
      <Modal
        open={cancelModalOpen}
        title={`Cancel Order #${order.orderNumber}`}
        onClose={() => setCancelModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelModalOpen(false)}>
              Keep Order
            </Button>
            <Button
              variant="danger"
              busy={action.busy}
              onClick={() => void handleCancelOrder()}
            >
              Yes, Cancel Order
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--muted)]">
          Are you sure you want to cancel Order <strong>#{order.orderNumber}</strong>? This will cease kitchen production and halt logistics.
        </p>
      </Modal>

      {/* ADMIN OVERRIDE DELIVERY TIME MODAL */}
      <Modal
        open={overrideTimeModalOpen}
        title="Admin Override: Delivery Time"
        onClose={() => setOverrideTimeModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOverrideTimeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={action.busy}
              onClick={(e) => void handleOverrideTime(e)}
            >
              Update Time
            </Button>
          </>
        }
      >
        <form onSubmit={handleOverrideTime} className="space-y-4">
          <Input
            label="New Delivery Time (HH:mm)"
            type="time"
            value={newDeliveryTime}
            required
            onChange={(e) => setNewDeliveryTime(e.target.value)}
          />
        </form>
      </Modal>

      {/* ADMIN OVERRIDE ADDRESS MODAL */}
      <Modal
        open={overrideAddressModalOpen}
        title="Admin Override: Delivery Address"
        onClose={() => setOverrideAddressModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOverrideAddressModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={action.busy}
              disabled={!newAddressId}
              onClick={(e) => void handleOverrideAddress(e)}
            >
              Update Address
            </Button>
          </>
        }
      >
        <form onSubmit={handleOverrideAddress} className="space-y-4">
          <Select
            label="Select Corporate Address"
            value={newAddressId}
            required
            onChange={(e) => setNewAddressId(e.target.value)}
          >
            <option value="">Choose address…</option>
            {companyDetails?.addresses?.map((addr) => (
              <option key={addr.id} value={addr.id}>
                {addr.label}: {addr.line1}, {addr.city}
              </option>
            ))}
          </Select>
        </form>
      </Modal>

      {/* ADMIN OVERRIDE PACKAGING MODAL */}
      <Modal
        open={overridePackagingModalOpen}
        title="Admin Override: Packaging Type"
        onClose={() => setOverridePackagingModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOverridePackagingModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={action.busy}
              disabled={!newPackagingTypeId}
              onClick={(e) => void handleOverridePackaging(e)}
            >
              Update Packaging
            </Button>
          </>
        }
      >
        <form onSubmit={handleOverridePackaging} className="space-y-4">
          <Select
            label="Select Packaging Type"
            value={newPackagingTypeId}
            required
            onChange={(e) => setNewPackagingTypeId(e.target.value)}
          >
            <option value="">Choose packaging…</option>
            {packagingTypes?.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} ({pkg.code})
              </option>
            ))}
          </Select>
        </form>
      </Modal>

      {/* ADD CREDIT MODAL */}
      <Modal
        open={creditModalOpen}
        title={`Issue Credit on Order #${order.orderNumber}`}
        onClose={() => setCreditModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={action.busy}
              onClick={(e) => void handleCreateCredit(e)}
            >
              Issue Credit Note
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateCredit} className="space-y-4">
          <Input
            label="Credit Amount (₹ Rupees)"
            type="text"
            placeholder="e.g. 150.00"
            value={creditAmount}
            required
            onChange={(e) => setCreditAmount(e.target.value)}
            hint="Amount in INR rupees to refund or credit against invoice"
          />
          <Textarea
            label="Credit Reason"
            placeholder="e.g. Meal delivered cold, missing cutlery, quality issue…"
            value={creditReason}
            required
            onChange={(e) => setCreditReason(e.target.value)}
          />
          {order.invoice ? (
            <p className="text-xs text-[var(--muted)]">
              This credit will be linked to Invoice #{order.invoice.invoiceNumber}.
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
