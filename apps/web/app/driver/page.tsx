'use client';

import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, Feedback } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { driverDeliver, driverDropsToday, type DriverDrop } from '../../lib/api/driver';
import { useAuth } from '../../lib/auth-context';
import { formatDate, greeting, todayIso } from '../../lib/format';
import { useAction, useLoad } from '../../lib/use-load';

export default function DriverPage() {
  const { profile } = useAuth();
  const [deliveringDrop, setDeliveringDrop] = useState<DriverDrop | null>(null);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [deliveryFile, setDeliveryFile] = useState<File | null>(null);

  const { data, loading, error, reload } = useLoad(() => driverDropsToday(), []);
  const { run: runAction, busy: actionBusy, error: actionError, notice: actionNotice, setError: setActionError } = useAction();

  const drops = useMemo(() => data?.drops ?? [], [data]);

  const completedDrops = useMemo(
    () => drops.filter((d) => d.status === 'DELIVERED'),
    [drops],
  );

  const pendingDrops = useMemo(
    () => drops.filter((d) => d.status !== 'DELIVERED' && d.status !== 'CANCELLED'),
    [drops],
  );

  // The active/next drop is the first pending one
  const nextDrop = pendingDrops[0] ?? null;
  const subsequentDrops = pendingDrops.slice(1);

  const totalCount = drops.length;
  const completedCount = completedDrops.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleOpenDeliveryModal = (drop: DriverDrop) => {
    setDeliveringDrop(drop);
    setDeliveryNote('');
    setDeliveryFile(null);
  };

  const handleConfirmDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveringDrop) return;

    setActionError(null);
    const ok = await runAction(
      () => driverDeliver(deliveringDrop.id, deliveryNote || undefined, deliveryFile || undefined),
      `Delivery completed for ${deliveringDrop.company.name}!`,
    );

    if (ok !== undefined) {
      setDeliveringDrop(null);
      setDeliveryNote('');
      setDeliveryFile(null);
      reload();
    }
  };

  const buildMapsUrl = (address: DriverDrop['address']) => {
    if (!address) return '#';
    const query = [address.line1, address.city, address.label].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  };

  return (
    <main className="container mx-auto max-w-2xl px-4 py-6 sm:px-6">
      {/* Header with Greeting & Date */}
      <div className="mb-6">
        <PageHeader
          eyebrow={formatDate(data?.date ?? todayIso())}
          title={`${greeting()}${profile?.email ? `!` : '!'}`}
          description="Your dedicated delivery route and drop confirmations for today."
          actions={
            <Button
              variant="subtle"
              size="sm"
              icon="refresh"
              onClick={reload}
              disabled={loading || actionBusy}
            >
              Refresh
            </Button>
          }
        />

        {/* Progress Bar */}
        {totalCount > 0 && (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-[var(--navy)]">
                Today&apos;s Run Progress
              </span>
              <span className="font-bold text-[var(--orange-deep)]">
                {completedCount} of {totalCount} completed ({progressPercent}%)
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--cream-soft)]">
              <div
                className="h-full bg-[var(--orange)] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <Feedback error={actionError} notice={actionNotice} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-4">
          <Skeleton className="h-56" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : drops.length === 0 ? (
        <EmptyState
          icon="driver"
          title="No deliveries assigned"
          hint="You have no delivery drops scheduled for today. Check in with the dispatch coordinator."
        />
      ) : (
        <div className="space-y-6">
          {/* Active / Next Drop Highlight */}
          {nextDrop ? (
            <section aria-labelledby="next-drop-title">
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow text-[var(--orange-deep)]">Current Priority</span>
                <Badge tone="warning">Up Next</Badge>
              </div>

              <Card className="border-2 border-[var(--orange)] bg-white p-5 shadow-md">
                <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
                  <div>
                    <span className="serif text-3xl font-extrabold text-[var(--navy)]">
                      {nextDrop.deliveryTime}
                    </span>
                    <h2
                      id="next-drop-title"
                      className="serif mt-1 text-2xl font-bold text-[var(--navy)]"
                    >
                      {nextDrop.company.name}
                    </h2>
                  </div>
                  <OrderStatusBadge status={nextDrop.status} />
                </div>

                <div className="my-4 space-y-2">
                  {nextDrop.address ? (
                    <div className="rounded-[var(--radius-sm)] bg-[var(--ivory)] p-3.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--navy)]">
                        {nextDrop.address.label}
                      </p>
                      <p className="mt-1 text-base font-semibold text-[var(--text)]">
                        {nextDrop.address.line1}
                      </p>
                      <p className="text-sm text-[var(--muted)]">
                        {nextDrop.address.city}
                      </p>
                    </div>
                  ) : (
                    <p className="italic text-sm text-[var(--muted)]">
                      No delivery address attached.
                    </p>
                  )}

                  {nextDrop.notes ? (
                    <div className="rounded-[var(--radius-sm)] border border-[#e58b20]/30 bg-[var(--orange-soft)]/20 p-3 text-xs text-[#a85f0c]">
                      <span className="font-bold">Delivery Instructions:</span> {nextDrop.notes}
                    </div>
                  ) : null}

                  {nextDrop.orders.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs font-semibold text-[var(--muted)]">
                        Packages:
                      </span>
                      {nextDrop.orders.map((ord) => (
                        <span
                          key={ord.id}
                          className="rounded bg-[var(--cream-soft)] px-2 py-0.5 text-xs font-bold text-[var(--navy)]"
                        >
                          #{ord.orderNumber}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Big Touch-Friendly Buttons */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2">
                  {nextDrop.address ? (
                    <a
                      href={buildMapsUrl(nextDrop.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-4 text-base font-semibold text-[var(--navy)] shadow-sm hover:bg-[var(--cream-soft)] active:scale-[0.98]"
                    >
                      <Icon name="map" className="h-5 w-5 text-[var(--orange-deep)]" />
                      Navigate in Maps
                    </a>
                  ) : null}

                  <Button
                    size="lg"
                    variant="primary"
                    className="w-full text-base font-bold shadow-md"
                    onClick={() => handleOpenDeliveryModal(nextDrop)}
                  >
                    <Icon name="check" className="h-5 w-5 mr-1" />
                    Complete Delivery
                  </Button>
                </div>
              </Card>
            </section>
          ) : (
            <div className="rounded-[var(--radius)] border border-[var(--success)]/40 bg-[var(--success-soft)] p-6 text-center text-[var(--success)]">
              <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-white">
                <Icon name="check" className="h-6 w-6 text-[var(--success)]" />
              </span>
              <h2 className="serif text-2xl font-bold">All deliveries completed!</h2>
              <p className="mt-1 text-sm opacity-90">
                You have fulfilled all assigned drops for today. Safe travels back to base!
              </p>
            </div>
          )}

          {/* Subsequent Pending Drops */}
          {subsequentDrops.length > 0 && (
            <section className="space-y-3">
              <h3 className="eyebrow text-[var(--muted)]">Remaining Stops ({subsequentDrops.length})</h3>
              <div className="space-y-3">
                {subsequentDrops.map((drop, idx) => (
                  <Card key={drop.id} className="p-4 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--cream-soft)] text-xs font-bold text-[var(--navy)]">
                          {idx + 2}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[var(--navy)]">
                              {drop.deliveryTime}
                            </span>
                            <span className="text-sm font-semibold text-[var(--text)]">
                              {drop.company.name}
                            </span>
                          </div>
                          {drop.address ? (
                            <p className="mt-0.5 text-xs text-[var(--muted)]">
                              {drop.address.line1}, {drop.address.city}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <OrderStatusBadge status={drop.status} />
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Completed Drops */}
          {completedDrops.length > 0 && (
            <section className="space-y-3 pt-4 border-t border-[var(--border)]">
              <h3 className="eyebrow text-[var(--success)]">
                Completed Today ({completedDrops.length})
              </h3>
              <div className="space-y-2.5">
                {completedDrops.map((drop) => (
                  <div
                    key={drop.id}
                    className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] px-4 py-3 text-sm opacity-85"
                  >
                    <div className="flex items-center gap-3">
                      <Icon name="check" className="h-4 w-4 text-[var(--success)] shrink-0" />
                      <div>
                        <p className="font-semibold text-[var(--navy)] line-through opacity-80">
                          {drop.company.name}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          Scheduled: {drop.deliveryTime}
                        </p>
                      </div>
                    </div>
                    <Badge tone="success">Delivered</Badge>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Complete Delivery Modal */}
      <Modal
        open={Boolean(deliveringDrop)}
        title="Confirm Drop Delivery"
        onClose={() => setDeliveringDrop(null)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDeliveringDrop(null)}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={actionBusy}
              onClick={handleConfirmDelivery}
            >
              Confirm Delivery
            </Button>
          </>
        }
      >
        <form onSubmit={handleConfirmDelivery} className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-[var(--navy)]">
              Drop for {deliveringDrop?.company.name}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {deliveringDrop?.address?.line1}, {deliveringDrop?.address?.city}
            </p>
          </div>

          <Textarea
            label="Handover Notes (Optional)"
            placeholder="e.g. Left with reception / security, signed by Aarti"
            value={deliveryNote}
            onChange={(e) => setDeliveryNote(e.target.value)}
          />

          <div>
            <label className="block text-sm font-semibold text-[var(--navy)] mb-1">
              Proof of Delivery Photo (Optional)
            </label>
            <div className="relative mt-1 flex justify-center rounded-[var(--radius-sm)] border-2 border-dashed border-[var(--border)] px-6 pt-5 pb-6">
              <div className="text-center">
                <Icon name="camera" className="mx-auto h-10 w-10 text-[var(--muted)]" />
                <div className="mt-2 flex text-sm text-[var(--navy)]">
                  <label
                    htmlFor="delivery-file-upload"
                    className="relative cursor-pointer rounded-md font-semibold text-[var(--orange-deep)] hover:underline"
                  >
                    <span>Take photo or upload image</span>
                    <input
                      id="delivery-file-upload"
                      name="delivery-file-upload"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setDeliveryFile(file);
                      }}
                    />
                  </label>
                </div>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {deliveryFile ? deliveryFile.name : 'PNG, JPG up to 10MB'}
                </p>
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </main>
  );
}
