'use client';

import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, Feedback } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge';
import { PageHeader, Toolbar } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Select';
import { SkeletonGrid } from '../../components/ui/Skeleton';
import { eligibleDrivers } from '../../lib/api/companies';
import {
  assignDriver,
  listDrops,
  markDelivered,
  markDispatchReady,
  markOut,
  type Drop,
} from '../../lib/api/dispatch';
import { useAuth } from '../../lib/auth-context';
import { formatClock, formatDate, todayIso } from '../../lib/format';
import { useAction, useLoad } from '../../lib/use-load';

export default function DispatchPage() {
  const { can } = useAuth();
  const [date, setDate] = useState<string>(() => todayIso());
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Driver assign modal
  const [assigningDrop, setAssigningDrop] = useState<Drop | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');

  const { data: dropsData, loading: dropsLoading, error: dropsError, reload: reloadDrops } = useLoad(
    () => listDrops(date),
    [date],
  );

  const { data: driversData, loading: driversLoading } = useLoad(
    () => eligibleDrivers().catch(() => []),
    [],
  );

  const { run: runAction, busy: actionBusy, error: actionError, notice: actionNotice, setError: setActionError } = useAction();

  const drops = useMemo(() => dropsData?.drops ?? [], [dropsData]);

  // Evaluate late or leaving soon status
  const evaluatedDrops = useMemo(() => {
    const isToday = date === todayIso();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return drops.map((drop) => {
      let isLate = false;
      let isLeavingSoon = false;

      if (drop.status !== 'DELIVERED' && drop.status !== 'CANCELLED') {
        if (drop.onTime === false) {
          isLate = true;
        } else if (drop.deliveryTime) {
          const [h, m] = drop.deliveryTime.split(':').map(Number);
          const dropMinutes = h * 60 + m;

          if (isToday) {
            if (currentMinutes > dropMinutes) {
              isLate = true;
            } else if (dropMinutes - currentMinutes <= 60 && drop.status !== 'OUT_FOR_DELIVERY') {
              isLeavingSoon = true;
            }
          }
        }
      }

      return {
        ...drop,
        isLate,
        isLeavingSoon,
      };
    });
  }, [drops, date]);

  const lateCount = evaluatedDrops.filter((d) => d.isLate).length;
  const leavingSoonCount = evaluatedDrops.filter((d) => d.isLeavingSoon).length;

  const filteredDrops = useMemo(() => {
    if (filterStatus === 'ALL') return evaluatedDrops;
    if (filterStatus === 'LATE') return evaluatedDrops.filter((d) => d.isLate);
    if (filterStatus === 'LEAVING_SOON') return evaluatedDrops.filter((d) => d.isLeavingSoon);
    return evaluatedDrops.filter((d) => d.status === filterStatus);
  }, [evaluatedDrops, filterStatus]);

  const handleOpenAssignModal = (drop: Drop) => {
    setAssigningDrop(drop);
    setSelectedDriverId(drop.driver?.id ?? '');
  };

  const handleSaveDriver = async () => {
    if (!assigningDrop || !selectedDriverId) return;
    setActionError(null);
    const ok = await runAction(
      () => assignDriver(assigningDrop.id, selectedDriverId),
      `Driver assigned to drop for ${assigningDrop.company.name}`,
    );
    if (ok !== undefined) {
      setAssigningDrop(null);
      reloadDrops();
    }
  };

  const handleMarkOut = async (drop: Drop) => {
    setActionError(null);
    const ok = await runAction(
      () => markOut(drop.id),
      `Drop for ${drop.company.name} marked out for delivery`,
    );
    if (ok !== undefined) {
      reloadDrops();
    }
  };

  const handleMarkDelivered = async (drop: Drop) => {
    setActionError(null);
    const ok = await runAction(
      () => markDelivered(drop.id),
      `Drop for ${drop.company.name} marked as delivered`,
    );
    if (ok !== undefined) {
      reloadDrops();
    }
  };

  const handleMarkOrderReady = async (orderId: string, orderNumber: string) => {
    setActionError(null);
    const ok = await runAction(
      () => markDispatchReady(orderId),
      `Order #${orderNumber} marked dispatch ready`,
    );
    if (ok !== undefined) {
      reloadDrops();
    }
  };

  const driversList = driversData ?? [];

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Logistics"
        title="Dispatch Operations"
        description="Monitor delivery runs, driver assignments, and fulfillment milestones."
        actions={
          <Button
            variant="subtle"
            icon="refresh"
            onClick={reloadDrops}
            disabled={dropsLoading || actionBusy}
          >
            Refresh
          </Button>
        }
      />

      <Toolbar>
        <div className="flex flex-wrap items-end gap-3 w-full sm:w-auto">
          <div className="w-48">
            <Input
              label="Delivery Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {date !== todayIso() ? (
            <Button
              variant="ghost"
              size="md"
              onClick={() => setDate(todayIso())}
            >
              Today
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 self-end ml-auto">
          <button
            type="button"
            onClick={() => setFilterStatus('ALL')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filterStatus === 'ALL'
                ? 'bg-[var(--navy)] text-white'
                : 'bg-white text-[var(--muted)] hover:bg-[var(--cream-soft)]'
            }`}
          >
            All ({drops.length})
          </button>
          {leavingSoonCount > 0 ? (
            <button
              type="button"
              onClick={() => setFilterStatus('LEAVING_SOON')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filterStatus === 'LEAVING_SOON'
                  ? 'bg-[#a85f0c] text-white'
                  : 'bg-[var(--orange-soft)] text-[#a85f0c] hover:opacity-90'
              }`}
            >
              Leaving Soon ({leavingSoonCount})
            </button>
          ) : null}
          {lateCount > 0 ? (
            <button
              type="button"
              onClick={() => setFilterStatus('LATE')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filterStatus === 'LATE'
                  ? 'bg-[var(--danger)] text-white'
                  : 'bg-[var(--danger-soft)] text-[var(--danger)] hover:opacity-90'
              }`}
            >
              Late ({lateCount})
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setFilterStatus('OUT_FOR_DELIVERY')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filterStatus === 'OUT_FOR_DELIVERY'
                ? 'bg-[var(--navy)] text-white'
                : 'bg-white text-[var(--muted)] hover:bg-[var(--cream-soft)]'
            }`}
          >
            Out ({drops.filter((d) => d.status === 'OUT_FOR_DELIVERY').length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('DELIVERED')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filterStatus === 'DELIVERED'
                ? 'bg-[var(--navy)] text-white'
                : 'bg-white text-[var(--muted)] hover:bg-[var(--cream-soft)]'
            }`}
          >
            Delivered ({drops.filter((d) => d.status === 'DELIVERED').length})
          </button>
        </div>
      </Toolbar>

      {/* Operational Highlights */}
      {(lateCount > 0 || leavingSoonCount > 0) && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {leavingSoonCount > 0 && (
            <div className="fade-in flex items-center justify-between rounded-[var(--radius)] border border-[#e58b20]/40 bg-[var(--orange-soft)] p-4 text-[#a85f0c]">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/70">
                  <Icon name="clock" className="h-5 w-5 text-[#a85f0c]" />
                </span>
                <div>
                  <h3 className="font-bold text-sm">Leaving Soon</h3>
                  <p className="text-xs opacity-90">
                    {leavingSoonCount} {leavingSoonCount === 1 ? 'drop' : 'drops'} scheduled to depart within 60 minutes
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="!border-[#e58b20]/40 !text-[#a85f0c] hover:!bg-white"
                onClick={() => setFilterStatus('LEAVING_SOON')}
              >
                View
              </Button>
            </div>
          )}

          {lateCount > 0 && (
            <div className="fade-in flex items-center justify-between rounded-[var(--radius)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4 text-[var(--danger)]">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/70">
                  <Icon name="alert" className="h-5 w-5 text-[var(--danger)]" />
                </span>
                <div>
                  <h3 className="font-bold text-sm">Critical Attention Required</h3>
                  <p className="text-xs opacity-90">
                    {lateCount} {lateCount === 1 ? 'drop' : 'drops'} past target delivery window
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="!border-[var(--danger)]/40 !text-[var(--danger)] hover:!bg-white"
                onClick={() => setFilterStatus('LATE')}
              >
                View
              </Button>
            </div>
          )}
        </div>
      )}

      <Feedback error={actionError} notice={actionNotice} />

      {dropsError ? (
        <ErrorState message={dropsError} onRetry={reloadDrops} />
      ) : dropsLoading ? (
        <SkeletonGrid count={4} className="h-64" />
      ) : filteredDrops.length === 0 ? (
        <EmptyState
          icon="dispatch"
          title="No dispatch drops found"
          hint={
            filterStatus !== 'ALL'
              ? `No drops match the "${filterStatus}" filter for ${formatDate(date)}.`
              : `There are no scheduled drops for ${formatDate(date)}.`
          }
          action={
            filterStatus !== 'ALL' ? (
              <Button variant="ghost" onClick={() => setFilterStatus('ALL')}>
                Clear Filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredDrops.map((drop) => {
            const isReadyToLeave = drop.status === 'READY';
            const isOut = drop.status === 'OUT_FOR_DELIVERY';
            const isDelivered = drop.status === 'DELIVERED';

            return (
              <Card
                key={drop.id}
                className={`relative flex flex-col justify-between overflow-hidden border p-5 ${
                  drop.isLate
                    ? 'border-[var(--danger)] bg-[var(--danger-soft)]/20 shadow-md'
                    : drop.isLeavingSoon
                    ? 'border-[#e58b20] bg-[var(--orange-soft)]/10 shadow-md'
                    : 'border-[var(--border)] bg-white'
                }`}
              >
                <div>
                  {/* Top Header */}
                  <div className="mb-3 flex items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
                    <div>
                      <span className="serif text-2xl font-bold text-[var(--navy)]">
                        {drop.deliveryTime || '—'}
                      </span>
                      <p className="text-xs font-semibold text-[var(--muted)]">
                        Scheduled Window
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <OrderStatusBadge status={drop.status} />
                      {drop.isLate ? (
                        <Badge tone="danger">Late</Badge>
                      ) : drop.isLeavingSoon ? (
                        <Badge tone="warning">Leaving Soon</Badge>
                      ) : null}
                    </div>
                  </div>

                  {/* Company & Destination */}
                  <div className="mb-4">
                    <h2 className="serif text-xl font-bold text-[var(--navy)]">
                      {drop.company.name}
                    </h2>
                    {drop.address ? (
                      <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">
                        <span className="font-semibold text-[var(--text)]">
                          {drop.address.label}:{' '}
                        </span>
                        {drop.address.line1}, {drop.address.city}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs italic text-[var(--muted)]">
                        No address provided
                      </p>
                    )}
                    {drop.notes ? (
                      <p className="mt-2 rounded bg-[var(--ivory)] p-2 text-xs text-[var(--muted)] italic">
                        Note: {drop.notes}
                      </p>
                    ) : null}
                  </div>

                  {/* Driver Assignment */}
                  <div className="mb-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon name="driver" className="h-4 w-4 text-[var(--navy)]" />
                        <div>
                          <p className="text-xs font-semibold text-[var(--navy)]">
                            {drop.driver ? drop.driver.fullName : 'No driver assigned'}
                          </p>
                          {drop.driver ? (
                            <span className="text-[10px] text-[var(--muted)]">
                              Code: {drop.driver.staffCode}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {can('dispatch.manage') && !isDelivered ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenAssignModal(drop)}
                        >
                          {drop.driver ? 'Change' : 'Assign'}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* Orders in Drop */}
                  <div className="mb-4 space-y-1.5">
                    <p className="text-xs font-bold text-[var(--navy)] uppercase tracking-wider">
                      Orders ({drop.orders.length})
                    </p>
                    <div className="space-y-1.5">
                      {drop.orders.map((ord) => (
                        <div
                          key={ord.id}
                          className="flex items-center justify-between rounded border border-[var(--border)]/60 bg-white px-2.5 py-1.5 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--navy)]">
                              #{ord.orderNumber}
                            </span>
                            <OrderStatusBadge status={ord.status} />
                          </div>
                          {can('dispatch.manage') &&
                          ord.status !== 'DISPATCH_READY' &&
                          ord.status !== 'READY' &&
                          ord.status !== 'OUT_FOR_DELIVERY' &&
                          ord.status !== 'DELIVERED' ? (
                            <Button
                              size="sm"
                              variant="subtle"
                              className="text-[11px] py-0.5 px-2 h-6"
                              disabled={actionBusy}
                              onClick={() => handleMarkOrderReady(ord.id, ord.orderNumber)}
                            >
                              Ready
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Drop Actions */}
                {can('dispatch.manage') ? (
                  <div className="border-t border-[var(--border)] pt-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {isReadyToLeave ? (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={actionBusy}
                          onClick={() => handleMarkOut(drop)}
                        >
                          Mark Out for Delivery
                        </Button>
                      ) : null}
                      {isOut ? (
                        <Button
                          size="sm"
                          variant="navy"
                          disabled={actionBusy}
                          onClick={() => handleMarkDelivered(drop)}
                        >
                          Mark Delivered
                        </Button>
                      ) : null}
                      {isDelivered && drop.deliveredAt ? (
                        <p className="text-xs text-[var(--success)] font-semibold flex items-center gap-1">
                          <Icon name="check" className="h-3.5 w-3.5" />
                          Delivered at {formatClock(drop.deliveredAt)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {/* Driver Assignment Modal */}
      <Modal
        open={Boolean(assigningDrop)}
        title="Assign Driver"
        onClose={() => setAssigningDrop(null)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setAssigningDrop(null)}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button
              variant="navy"
              onClick={handleSaveDriver}
              disabled={!selectedDriverId || actionBusy}
              busy={actionBusy}
            >
              Confirm Assignment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            Assign a verified driver for the delivery run to{' '}
            <strong className="text-[var(--navy)]">{assigningDrop?.company.name}</strong> at{' '}
            {assigningDrop?.deliveryTime}.
          </p>

          {driversLoading ? (
            <p className="text-xs text-[var(--muted)]">Loading available drivers…</p>
          ) : driversList.length === 0 ? (
            <p className="rounded border border-[var(--warning)]/30 bg-[var(--warning-soft)] p-3 text-xs text-[#9a6a12]">
              No active drivers registered in the system. Check staff settings.
            </p>
          ) : (
            <Select
              label="Select Driver"
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
            >
              <option value="">Choose a driver…</option>
              {driversList.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.fullName} ({driver.staffCode})
                </option>
              ))}
            </Select>
          )}
        </div>
      </Modal>
    </main>
  );
}
