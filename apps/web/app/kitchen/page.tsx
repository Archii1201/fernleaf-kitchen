'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Feedback } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge';
import { PageHeader, Toolbar } from '../../components/ui/PageHeader';
import { SkeletonGrid } from '../../components/ui/Skeleton';
import {
  doneUnit,
  forceComplete,
  kitchenBoard,
  processCutoff,
  startUnit,
  type KitchenOrder,
  type KitchenUnit,
} from '../../lib/api/kitchen';
import { useAuth } from '../../lib/auth-context';
import { formatClock, formatDate, formatDateTime, todayIso } from '../../lib/format';
import { useAction, useLoad } from '../../lib/use-load';

export default function KitchenPage() {
  return (
    <Suspense
      fallback={
        <main className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <SkeletonGrid count={3} className="h-96" />
        </main>
      }
    >
      <KitchenBoardContent />
    </Suspense>
  );
}

function KitchenBoardContent() {
  const { can } = useAuth();
  const searchParams = useSearchParams();
  const queryDate = searchParams?.get('date');
  const [date, setDate] = useState<string>(() => queryDate || todayIso());
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);
  const [showCutoffConfirm, setShowCutoffConfirm] = useState(false);

  const { data, loading, error, reload } = useLoad(() => kitchenBoard(date), [date]);
  const {
    run: runAction,
    busy: actionBusy,
    error: actionError,
    notice: actionNotice,
    setError: setActionError,
    setNotice: setActionNotice,
  } = useAction();

  const handleStartUnit = async (unit: KitchenUnit) => {
    setActionError(null);
    const ok = await runAction(() => startUnit(unit.id), `Started prep for ${unit.dish.name}`);
    if (ok !== undefined) {
      reload();
    }
  };

  const handleDoneUnit = async (unit: KitchenUnit) => {
    setActionError(null);
    const ok = await runAction(() => doneUnit(unit.id), `Completed prep for ${unit.dish.name}`);
    if (ok !== undefined) {
      reload();
    }
  };

  const handleForceComplete = async () => {
    if (!selectedOrder) return;
    const ok = await runAction(
      () => forceComplete(selectedOrder.id),
      `Force completed order ${selectedOrder.orderNumber}`,
    );
    if (ok !== undefined) {
      setSelectedOrder(null);
      reload();
    }
  };

  const handleProcessCutoff = async () => {
    setShowCutoffConfirm(false);
    setActionError(null);
    setActionNotice(null);

    const result = await runAction(() => processCutoff(date));
    if (!result) {
      return;
    }

    if (result.skipped) {
      if (result.reason === 'CUTOFF_NOT_PASSED') {
        setActionError(
          `Cutoff has not passed yet for ${formatDate(result.date)}. Orders remain in PLACED status until cutoff deadline at ${formatDateTime(result.cutoffAt)}.`,
        );
      } else if (result.alreadyProcessed) {
        setActionNotice(
          `Cutoff was already processed earlier for ${formatDate(result.date)} (${result.confirmed} orders confirmed, ${result.cancelled} drafts cancelled). No new orders were confirmed.`,
        );
      } else {
        setActionError(
          `Cutoff processing skipped for ${formatDate(result.date)}: ${result.reason ?? 'Cutoff criteria not met'}.`,
        );
      }
    } else if (result.processed) {
      setActionNotice(
        `Cutoff processed successfully for ${formatDate(result.date)}: ${result.confirmed} order${result.confirmed === 1 ? '' : 's'} confirmed, ${result.cancelled} draft${result.cancelled === 1 ? '' : 's'} cancelled, ${result.drops} drop${result.drops === 1 ? '' : 's'} scheduled.`,
      );
    }
    reload();
  };

  const totalOrders = data?.stations.reduce((acc, s) => acc + s.orders.length, 0) ?? 0;

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Production"
        title="Kitchen Board"
        description="Live station assembly lines, prep unit tracking, and cutoff operations."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {can('kitchen.update') ? (
              <Button
                variant="ghost"
                icon="clock"
                disabled={actionBusy}
                onClick={() => setShowCutoffConfirm(true)}
              >
                Process Cutoff
              </Button>
            ) : null}
            <Button
              variant="subtle"
              icon="refresh"
              onClick={reload}
              disabled={loading || actionBusy}
            >
              Refresh
            </Button>
          </div>
        }
      />

      <Toolbar>
        <div className="flex flex-wrap items-end gap-3 w-full sm:w-auto">
          <div className="w-48">
            <Input
              label="Production Date"
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
        {data?.evaluatedAt ? (
          <p className="text-xs text-[var(--muted)] self-center ml-auto">
            Evaluated at {formatClock(data.evaluatedAt)}
          </p>
        ) : null}
      </Toolbar>

      <Feedback error={actionError} notice={actionNotice} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <SkeletonGrid count={3} className="h-96" />
      ) : !data || data.stations.length === 0 || totalOrders === 0 ? (
        <EmptyState
          icon="kitchen"
          title="No active prep units"
          hint={`There are no kitchen orders scheduled for ${formatDate(date)}.`}
          action={
            can('kitchen.update') ? (
              <Button
                variant="primary"
                onClick={() => setShowCutoffConfirm(true)}
              >
                Process Cutoff for {formatDate(date)}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {data.stations.map(({ station, orders }) => (
            <section
              key={station.id ?? station.code}
              className="flex flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--cream)]/40 p-4"
            >
              <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div>
                  <h2 className="serif text-xl font-bold text-[var(--navy)]">
                    {station.name}
                  </h2>
                  <span className="eyebrow text-xs text-[var(--muted)]">
                    Code: {station.code}
                  </span>
                </div>
                <span className="rounded-full bg-[var(--navy)] px-2.5 py-0.5 text-xs font-semibold text-white">
                  {orders.length} {orders.length === 1 ? 'order' : 'orders'}
                </span>
              </div>

              {orders.length === 0 ? (
                <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
                  Station is clear.
                </div>
              ) : (
                <div className="space-y-4 overflow-y-auto">
                  {orders.map((order) => {
                    const unitsToDisplay = order.units;

                    return (
                      <Card
                        key={order.id}
                        className="bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="mb-3 flex items-start justify-between gap-2 border-b border-[var(--border)]/60 pb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[var(--navy)]">
                                #{order.orderNumber}
                              </span>
                              <OrderStatusBadge status={order.status} />
                            </div>
                            <p className="text-xs font-medium text-[var(--muted)]">
                              {order.company.name}
                            </p>
                          </div>
                          <div className="text-right">
                            {order.timing ? (
                              <div className="mb-1">
                                <OrderStatusBadge status={order.timing} />
                              </div>
                            ) : null}
                            {order.planned?.kitchenReadyAt ? (
                              <p className="text-xs text-[var(--muted)]">
                                Target: {formatClock(order.planned.kitchenReadyAt)}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          {unitsToDisplay.map((unit) => (
                            <div
                              key={unit.id}
                              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-2.5 text-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-semibold text-[var(--navy)]">
                                    <span className="mr-1.5 inline-block rounded bg-[var(--cream-soft)] px-1.5 py-0.2 text-xs font-bold text-[var(--orange-deep)]">
                                      {unit.quantity}×
                                    </span>
                                    {unit.dish.name}
                                  </div>
                                  {unit.combination?.options?.length > 0 ? (
                                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                                      {unit.combination.options
                                        .map((opt) => `${opt.group}: ${opt.name}`)
                                        .join(' · ')}
                                    </p>
                                  ) : null}
                                </div>
                                <OrderStatusBadge status={unit.status} />
                              </div>

                              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--border)]/40 pt-2 text-xs text-[var(--muted)]">
                                <span>
                                  {unit.startedAt
                                    ? `Started: ${formatClock(unit.startedAt)}`
                                    : 'Awaiting start'}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {unit.status === 'PENDING' ? (
                                    <Button
                                      size="sm"
                                      variant="navy"
                                      disabled={actionBusy}
                                      onClick={() => handleStartUnit(unit)}
                                    >
                                      Start
                                    </Button>
                                  ) : null}
                                  {unit.status === 'IN_PROGRESS' ? (
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      disabled={actionBusy}
                                      onClick={() => handleDoneUnit(unit)}
                                    >
                                      Done
                                    </Button>
                                  ) : null}
                                  {unit.status === 'READY' ? (
                                    <span className="inline-flex items-center gap-1 text-[var(--success)] font-medium">
                                      <Icon name="check" className="h-3.5 w-3.5" />
                                      Ready
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {can('kitchen.force_complete') && order.status !== 'READY' && order.status !== 'DELIVERED' ? (
                          <div className="mt-3 flex justify-end border-t border-[var(--border)]/40 pt-2">
                            <Button
                              variant="subtle"
                              size="sm"
                              className="text-xs text-[var(--muted)] hover:text-[var(--danger)]"
                              onClick={() => setSelectedOrder(order)}
                            >
                              Force Complete Order
                            </Button>
                          </div>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Force Complete Confirmation */}
      <ConfirmDialog
        open={Boolean(selectedOrder)}
        title="Force Complete Order"
        message={
          <>
            Are you sure you want to force complete order{' '}
            <strong className="text-[var(--navy)]">#{selectedOrder?.orderNumber}</strong>?
            All uncompleted prep units will be marked as ready immediately.
          </>
        }
        confirmLabel="Force Complete"
        tone="danger"
        busy={actionBusy}
        onConfirm={handleForceComplete}
        onCancel={() => setSelectedOrder(null)}
      />

      {/* Process Cutoff Confirmation */}
      <ConfirmDialog
        open={showCutoffConfirm}
        title="Run Cutoff Processing"
        message={
          <>
            Lock confirmed orders and generate kitchen production batches for{' '}
            <strong className="text-[var(--navy)]">{formatDate(date)}</strong>? This will commit all
            pending orders to the production board.
          </>
        }
        confirmLabel="Process Cutoff"
        tone="navy"
        busy={actionBusy}
        onConfirm={handleProcessCutoff}
        onCancel={() => setShowCutoffConfirm(false)}
      />
    </main>
  );
}
