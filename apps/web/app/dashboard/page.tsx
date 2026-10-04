'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { Button, LinkButton } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Skeleton, SkeletonGrid } from '../../components/ui/Skeleton';
import { Table } from '../../components/ui/Table';
import { Icon, type IconName } from '../../components/ui/Icon';
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge';
import { MetricCard } from '../../components/dashboard/MetricCard';
import { ProgressCard } from '../../components/dashboard/ProgressCard';
import { BarList } from '../../components/dashboard/BarList';
import { useLoad } from '../../lib/use-load';
import { useAuth } from '../../lib/auth-context';
import {
  rupees,
  formatDate,
  formatClock,
  humanize,
} from '../../lib/format';
import {
  adminDashboard,
  kitchenDashboard,
  dispatchDashboard,
  driverDashboard,
  type AdminDashboard,
  type KitchenDashboard,
  type DispatchDashboard,
  type DriverDashboard,
  type DispatchDropCard,
} from '../../lib/api/dashboard';

type DashboardView = 'admin' | 'kitchen' | 'dispatch' | 'driver';

interface ViewTab {
  value: DashboardView;
  label: string;
  icon: IconName;
  permission: string;
}

const DASHBOARD_TABS: ViewTab[] = [
  { value: 'admin', label: 'Admin', icon: 'dashboard', permission: 'reports.view' },
  { value: 'kitchen', label: 'Kitchen', icon: 'kitchen', permission: 'kitchen.view' },
  { value: 'dispatch', label: 'Dispatch', icon: 'dispatch', permission: 'dispatch.view' },
  { value: 'driver', label: 'Driver', icon: 'driver', permission: 'driver.view' },
];

function formatTimeDisplay(timeStr: string | null | undefined): string {
  if (!timeStr) return '—';
  if (timeStr.includes('T')) {
    return formatClock(timeStr);
  }
  return timeStr;
}

/* ==========================================================================
   Admin Dashboard View
   ========================================================================== */

function AdminDashboardView({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error, reload } = useLoad<AdminDashboard>(
    () => adminDashboard(),
    ['admin-dashboard', refreshKey],
  );

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading Admin Dashboard">
        <SkeletonGrid count={4} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={reload} />;
  }

  if (!data) {
    return null;
  }

  const { metrics, groups, lists } = data;
  const isKitchenComplete = metrics.kitchenProgress.percentComplete >= 100;

  return (
    <div className="fade-in space-y-6">
      {/* Primary Operational Pulse */}
      <section aria-labelledby="admin-operations-heading">
        <h2 id="admin-operations-heading" className="sr-only">Operations Metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Today's Orders"
            value={metrics.ordersToday}
            hint="Active operational orders"
            icon="orders"
            tone="navy"
          />
          <MetricCard
            label="Today's Meals"
            value={metrics.mealsToday}
            hint="Meal portions scheduled today"
            icon="menu"
            tone="navy"
          />
          <ProgressCard
            label="Kitchen Progress"
            percent={metrics.kitchenProgress.percentComplete}
            tone={isKitchenComplete ? 'success' : 'orange'}
            detail={`${metrics.kitchenProgress.completedUnits} of ${metrics.kitchenProgress.totalUnits} units complete`}
          >
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2 text-xs">
              <span className="text-[var(--muted)]">Status</span>
              <Badge tone={isKitchenComplete ? 'success' : 'orange'} dot>
                {isKitchenComplete ? 'Complete' : 'In Progress'}
              </Badge>
            </div>
          </ProgressCard>
          <MetricCard
            label="Next Cutoff"
            value={metrics.nextCutoff ? formatClock(metrics.nextCutoff.cutoffAt) : 'None'}
            hint={
              metrics.nextCutoff
                ? `Delivery on ${formatDate(metrics.nextCutoff.deliveryDate)}`
                : 'No pending order cutoffs'
            }
            icon="clock"
            tone={metrics.nextCutoff ? 'warning' : 'navy'}
          />
        </div>
      </section>

      {/* Financial Health */}
      <section aria-labelledby="admin-financial-heading">
        <h2 id="admin-financial-heading" className="sr-only">Financial Metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard
            label="Uninvoiced Balance"
            value={rupees(metrics.uninvoicedBalanceCents)}
            hint={`${metrics.uninvoicedOrderCount} billable orders awaiting invoice`}
            icon="billing"
            tone="orange"
          />
          <MetricCard
            label="Outstanding Invoices"
            value={rupees(metrics.outstandingInvoices.totalCents)}
            hint={`${metrics.outstandingInvoices.count} unpaid issued invoices`}
            icon="billing"
            tone="warning"
          />
        </div>
      </section>

      {/* Pending Cutoff Processing Notice */}
      {metrics.pendingCutoff && metrics.pendingCutoff.length > 0 && (
        <Card className="border-[var(--warning)]/40 bg-[var(--warning-soft)]/25">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--warning-soft)] text-[#9a6a12]">
              <Icon name="clock" className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="serif text-lg font-semibold text-[var(--navy)]">
                  Pending Cutoff Processing ({metrics.pendingCutoff.length})
                </h3>
                <Badge tone="warning" dot>Action Required</Badge>
              </div>
              <p className="mt-1 text-sm text-[var(--navy)]/80">
                The cutoff deadline has passed for the following delivery dates and require batch cutoff processing:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {metrics.pendingCutoff.map((item, idx) => (
                  <Link
                    key={idx}
                    href={`/kitchen?date=${item.date}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--navy)] shadow-xs transition-colors hover:border-[var(--navy)] hover:text-[var(--orange-deep)]"
                  >
                    <span>{formatDate(item.date)}</span>
                    <span className="text-[var(--muted)]">· Cutoff was {formatClock(item.cutoffAt)}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Forecast & Setup Health */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Next 7 Days Workload"
            eyebrow="DEMAND FORECAST"
            action={
              <span className="text-xs font-semibold text-[var(--muted)]">
                {groups.next7Days.reduce((acc, d) => acc + d.meals, 0)} meals total
              </span>
            }
          />
          <BarList
            rows={groups.next7Days.map((d) => ({
              label: formatDate(d.date),
              value: d.meals,
              hint: `${d.orders} order${d.orders === 1 ? '' : 's'} · ${d.meals} meal${d.meals === 1 ? '' : 's'}`,
            }))}
            empty="No orders scheduled for the next 7 days"
          />
        </Card>

        <Card>
          <CardHeader
            title="Setup Gaps"
            eyebrow="CONFIGURATION HEALTH"
            action={
              lists.setupGaps.length === 0 ? (
                <Badge tone="success" dot>All Good</Badge>
              ) : (
                <Badge tone="warning" dot>{lists.setupGaps.length} Issue{lists.setupGaps.length === 1 ? '' : 's'}</Badge>
              )
            }
          />
          {lists.setupGaps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
                <Icon name="check" className="h-6 w-6" />
              </span>
              <p className="serif text-xl font-semibold text-[var(--navy)]">No configuration gaps</p>
              <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">
                Default pricing tiers, kitchen operational settings, and active menus are fully configured.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {lists.setupGaps.map((gap, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--warning)]/30 bg-[var(--warning-soft)]/20 p-3.5 text-sm"
                >
                  <span className="mt-0.5 shrink-0">
                    <Badge tone="warning">{gap.code}</Badge>
                  </span>
                  <p className="flex-1 leading-snug text-[var(--navy)]">{gap.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ==========================================================================
   Kitchen Dashboard View
   ========================================================================== */

function KitchenDashboardView({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error, reload } = useLoad<KitchenDashboard>(
    () => kitchenDashboard(),
    ['kitchen-dashboard', refreshKey],
  );

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading Kitchen Dashboard">
        <SkeletonGrid count={4} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={reload} />;
  }

  if (!data) {
    return null;
  }

  const { metrics, groups, lists } = data;

  return (
    <div className="fade-in space-y-6">
      {/* Kitchen Operations Pulse */}
      <section aria-labelledby="kitchen-metrics-heading">
        <h2 id="kitchen-metrics-heading" className="sr-only">Kitchen Metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Units Today"
            value={metrics.unitsToday}
            hint="Total prep units on today's board"
            icon="kitchen"
            tone="navy"
          />
          <MetricCard
            label="Late Units"
            value={metrics.late}
            hint={metrics.late > 0 ? 'Past planned kitchen ready time' : 'All units on schedule'}
            icon="alert"
            tone={metrics.late > 0 ? 'danger' : 'navy'}
          />
          <MetricCard
            label="At-Risk Units"
            value={metrics.atRisk}
            hint={`Due within ${metrics.atRiskWindowMinutes} minutes`}
            icon="clock"
            tone={metrics.atRisk > 0 ? 'warning' : 'navy'}
          />
          <MetricCard
            label="Next Deadline"
            value={metrics.nextDeadline ? formatClock(metrics.nextDeadline.at) : 'None'}
            hint={
              metrics.nextDeadline
                ? `Order #${metrics.nextDeadline.orderNumber} (${metrics.nextDeadline.station || 'Unassigned'})`
                : 'No pending deadlines'
            }
            icon="clock"
            tone="navy"
          />
        </div>
      </section>

      {/* Station Distribution & Tomorrow Preview */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Units by Station"
            eyebrow="TODAY'S DISTRIBUTION"
            action={
              <span className="text-xs font-semibold text-[var(--muted)]">
                {metrics.unitsToday} units total
              </span>
            }
          />
          <BarList
            rows={groups.unitsByStation.map((station) => ({
              label: station.station || 'Unassigned',
              value: station.count,
              hint: `${station.count} unit${station.count === 1 ? '' : 's'}`,
            }))}
            empty="No stations scheduled today"
          />
        </Card>

        <Card>
          <CardHeader
            title="Tomorrow's Preview"
            eyebrow={`DATE: ${formatDate(groups.tomorrow?.date)}`}
            action={
              <span className="text-xs font-semibold text-[var(--muted)]">
                {groups.tomorrow?.units ?? 0} scheduled
              </span>
            }
          />
          <BarList
            rows={(groups.tomorrow?.byStation ?? []).map((station) => ({
              label: station.station || 'Unassigned',
              value: station.count,
              hint: `${station.count} unit${station.count === 1 ? '' : 's'}`,
            }))}
            empty="No prep units scheduled for tomorrow yet"
          />
        </Card>
      </div>

      {/* Active Prep Workload */}
      <Card>
        <CardHeader
          title="Active Prep Workload"
          eyebrow="TODAY'S KITCHEN BOARD"
          action={
            <LinkButton href="/kitchen" variant="ghost" size="sm" icon="kitchen">
              Open Kitchen Board
            </LinkButton>
          }
        />
        {lists.prep.length === 0 ? (
          <EmptyState
            icon="kitchen"
            title="No prep units in queue"
            hint="All kitchen prep units for today have been completed or none are scheduled."
          />
        ) : (
          <Table
            caption="Today's active prep units"
            rowKey={(unit) => unit.id}
            columns={[
              {
                key: 'dish',
                header: 'Dish',
                render: (row) => <span className="font-semibold text-[var(--navy)]">{row.dish}</span>,
              },
              {
                key: 'orderNumber',
                header: 'Order #',
                render: (row) => <span className="font-mono text-xs">#{row.orderNumber}</span>,
              },
              {
                key: 'station',
                header: 'Station',
                render: (row) => <Badge tone="navy">{row.station || 'Unassigned'}</Badge>,
              },
              {
                key: 'timing',
                header: 'Timing',
                render: (row) => (
                  <div className="flex items-center gap-2">
                    <OrderStatusBadge status={row.timing} />
                    {row.kitchenReadyAt ? (
                      <span className="text-xs text-[var(--muted)]">{formatClock(row.kitchenReadyAt)}</span>
                    ) : null}
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <OrderStatusBadge status={row.status} />,
              },
            ]}
            rows={lists.prep}
          />
        )}
      </Card>
    </div>
  );
}

/* ==========================================================================
   Dispatch Dashboard View
   ========================================================================== */

function DispatchDashboardView({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error, reload } = useLoad<DispatchDashboard>(
    () => dispatchDashboard(),
    ['dispatch-dashboard', refreshKey],
  );

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading Dispatch Dashboard">
        <SkeletonGrid count={5} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={reload} />;
  }

  if (!data) {
    return null;
  }

  const { metrics, groups, lists } = data;
  const onTimeDisplay = metrics.onTimeRatePercent !== null ? `${metrics.onTimeRatePercent}%` : 'No deliveries';

  return (
    <div className="fade-in space-y-6">
      {/* Dispatch Operations Pulse */}
      <section aria-labelledby="dispatch-metrics-heading">
        <h2 id="dispatch-metrics-heading" className="sr-only">Dispatch Metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Drops Today"
            value={metrics.dropsToday}
            hint="Scheduled delivery drops"
            icon="dispatch"
            tone="navy"
          />
          <MetricCard
            label="Needs Driver"
            value={metrics.needsDriver}
            hint={metrics.needsDriver > 0 ? 'Unassigned open drops' : 'All drops assigned'}
            icon="alert"
            tone={metrics.needsDriver > 0 ? 'warning' : 'navy'}
          />
          <MetricCard
            label="Leaving Soon"
            value={metrics.leavingSoon}
            hint="Ready within next 30 min"
            icon="clock"
            tone={metrics.leavingSoon > 0 ? 'warning' : 'navy'}
          />
          <MetricCard
            label="Late Deliveries"
            value={metrics.late}
            hint={metrics.late > 0 ? 'Past dispatch ready time' : 'Zero delayed dispatches'}
            icon="alert"
            tone={metrics.late > 0 ? 'danger' : 'navy'}
          />
          <MetricCard
            label="On-Time Rate"
            value={onTimeDisplay}
            hint={`${metrics.deliveredToday} drops delivered today`}
            icon="check"
            tone={metrics.onTimeRatePercent !== null && metrics.onTimeRatePercent >= 90 ? 'success' : 'navy'}
          />
        </div>
      </section>

      {/* Driver Load & Status Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Driver Load"
            eyebrow="DROP DISTRIBUTION"
            action={
              <LinkButton href="/dispatch" variant="ghost" size="sm" icon="dispatch">
                Manage Dispatch
              </LinkButton>
            }
          />
          <BarList
            rows={groups.driverLoad.map((dl) => ({
              label: dl.driver || 'Unassigned',
              value: dl.count,
              hint: `${dl.count} drop${dl.count === 1 ? '' : 's'}`,
            }))}
            empty="No driver assignments recorded today"
          />
        </Card>

        <Card>
          <CardHeader title="Drops by Status" eyebrow="OPERATIONAL PROGRESS" />
          <BarList
            rows={Object.entries(groups.byStatus || {}).map(([status, count]) => ({
              label: humanize(status),
              value: count,
              hint: `${count} drop${count === 1 ? '' : 's'}`,
            }))}
            empty="No drops recorded today"
          />
        </Card>
      </div>

      {/* Actionable Drop Lists */}
      <div className="space-y-6">
        {lists.needsDriver.length > 0 && (
          <Card>
            <CardHeader
              title={`Needs Driver Assignment (${lists.needsDriver.length})`}
              eyebrow="ACTION REQUIRED"
              action={
                <LinkButton href="/dispatch" variant="primary" size="sm" icon="user">
                  Assign Drivers
                </LinkButton>
              }
            />
            <Table<DispatchDropCard>
              caption="Drops needing driver assignment"
              rowKey={(drop) => drop.id}
              columns={[
                {
                  key: 'company',
                  header: 'Company',
                  render: (d) => <span className="font-semibold text-[var(--navy)]">{d.company}</span>,
                },
                {
                  key: 'time',
                  header: 'Scheduled Time',
                  render: (d) => formatTimeDisplay(d.time),
                },
                {
                  key: 'readyAt',
                  header: 'Ready At',
                  render: (d) => (d.dispatchReadyAt ? formatClock(d.dispatchReadyAt) : '—'),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (d) => <OrderStatusBadge status={d.status} />,
                },
              ]}
              rows={lists.needsDriver}
            />
          </Card>
        )}

        {lists.leavingSoon.length > 0 && (
          <Card>
            <CardHeader
              title={`Leaving Soon (${lists.leavingSoon.length})`}
              eyebrow="DEPARTING WITHIN 30 MIN"
              action={
                <LinkButton href="/dispatch" variant="ghost" size="sm" icon="clock">
                  View Departure Queue
                </LinkButton>
              }
            />
            <Table<DispatchDropCard>
              caption="Drops leaving soon"
              rowKey={(drop) => drop.id}
              columns={[
                {
                  key: 'company',
                  header: 'Company',
                  render: (d) => <span className="font-semibold text-[var(--navy)]">{d.company}</span>,
                },
                {
                  key: 'time',
                  header: 'Delivery Time',
                  render: (d) => formatTimeDisplay(d.time),
                },
                {
                  key: 'driver',
                  header: 'Driver',
                  render: (d) =>
                    d.driver ? <Badge tone="navy">{d.driver}</Badge> : <Badge tone="warning">Unassigned</Badge>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (d) => <OrderStatusBadge status={d.status} />,
                },
              ]}
              rows={lists.leavingSoon}
            />
          </Card>
        )}

        {lists.late.length > 0 && (
          <Card className="border-[var(--danger)]/30">
            <CardHeader
              title={`Late Deliveries (${lists.late.length})`}
              eyebrow="DELAYED DROPS"
              action={
                <LinkButton href="/dispatch" variant="danger" size="sm" icon="alert">
                  Resolve Delays
                </LinkButton>
              }
            />
            <Table<DispatchDropCard>
              caption="Late drops"
              rowKey={(drop) => drop.id}
              columns={[
                {
                  key: 'company',
                  header: 'Company',
                  render: (d) => <span className="font-semibold text-[var(--navy)]">{d.company}</span>,
                },
                {
                  key: 'time',
                  header: 'Delivery Time',
                  render: (d) => formatTimeDisplay(d.time),
                },
                {
                  key: 'driver',
                  header: 'Driver',
                  render: (d) =>
                    d.driver ? <Badge tone="navy">{d.driver}</Badge> : <Badge tone="danger">Unassigned</Badge>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: () => <OrderStatusBadge status="LATE" />,
                },
              ]}
              rows={lists.late}
            />
          </Card>
        )}

        {lists.needsDriver.length === 0 && lists.leavingSoon.length === 0 && lists.late.length === 0 && (
          <Card>
            <EmptyState
              icon="check"
              title="All deliveries running on schedule"
              hint="No drops currently requiring driver assignment, departing within 30 minutes, or delayed."
            />
          </Card>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   Driver Dashboard View
   ========================================================================== */

function DriverDashboardView({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error, reload } = useLoad<DriverDashboard>(
    () => driverDashboard(),
    ['driver-dashboard', refreshKey],
  );

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading Driver Dashboard">
        <SkeletonGrid count={4} />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={reload} />;
  }

  if (!data) {
    return null;
  }

  const { metrics, lists } = data;
  const isAllDelivered = metrics.percentDelivered >= 100 && metrics.assigned > 0;

  return (
    <div className="fade-in space-y-6">
      {/* Driver Pulse */}
      <section aria-labelledby="driver-metrics-heading">
        <h2 id="driver-metrics-heading" className="sr-only">Driver Metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ProgressCard
            label="Today's Delivery Progress"
            percent={metrics.percentDelivered}
            tone={isAllDelivered ? 'success' : 'orange'}
            detail={`${metrics.delivered} of ${metrics.assigned} assigned drops delivered`}
          >
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2 text-xs">
              <span className="text-[var(--muted)]">Remaining Drops</span>
              <span className="font-semibold text-[var(--navy)]">{metrics.remaining}</span>
            </div>
          </ProgressCard>
          <MetricCard
            label="Delivered"
            value={metrics.delivered}
            hint={`${metrics.onTimeCount} delivered on time`}
            icon="check"
            tone="success"
          />
          <MetricCard
            label="Remaining"
            value={metrics.remaining}
            hint={`${metrics.assigned} assigned today`}
            icon="dispatch"
            tone="navy"
          />
          <MetricCard
            label="On-Time Count"
            value={metrics.onTimeCount}
            hint="Completed within schedule"
            icon="check"
            tone="navy"
          />
        </div>
      </section>

      {/* Next Assigned Drop */}
      <Card>
        <CardHeader
          title="Next Scheduled Drop"
          eyebrow="UPCOMING STOP"
          action={
            <LinkButton href="/driver" variant="primary" size="sm" icon="driver">
              Open Driver View
            </LinkButton>
          }
        />
        {lists.nextDrop ? (
          <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--ivory)] p-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="eyebrow text-[var(--orange-deep)]">Destination</span>
                <h3 className="serif mt-1 text-2xl font-semibold text-[var(--navy)]">
                  {lists.nextDrop.company}
                </h3>
                <div className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
                  <Icon name="clock" className="h-4 w-4" />
                  <span>
                    Scheduled Time:{' '}
                    <strong className="text-[var(--navy)]">{formatTimeDisplay(lists.nextDrop.time)}</strong>
                  </span>
                </div>
              </div>
              <OrderStatusBadge status={lists.nextDrop.status} />
            </div>

            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <div className="flex items-start gap-2.5 text-sm text-[var(--navy)]">
                <Icon name="map" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--orange-deep)]" />
                <div>
                  {lists.nextDrop.address.label ? (
                    <span className="font-semibold text-[var(--muted)]">{lists.nextDrop.address.label}: </span>
                  ) : null}
                  <span>
                    {lists.nextDrop.address.line1}, {lists.nextDrop.address.city}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <LinkButton href="/driver" variant="primary" size="sm" icon="driver">
                Complete Delivery
              </LinkButton>
            </div>
          </div>
        ) : (
          <EmptyState
            icon="check"
            title="No pending deliveries"
            hint="You have no assigned drops waiting for delivery today. All scheduled drops are completed or none assigned."
          />
        )}
      </Card>
    </div>
  );
}

/* ==========================================================================
   Main Dashboard Page Component
   ========================================================================== */

export default function DashboardPage() {
  const { can, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardView>('admin');
  const [refreshKey, setRefreshKey] = useState(0);

  // Filter available tabs based on user permissions
  const availableTabs = useMemo(() => {
    return DASHBOARD_TABS.filter((tab) => can(tab.permission));
  }, [can]);

  // Determine active view: fallback to first allowed tab if current is invalid
  const currentView: DashboardView = useMemo(() => {
    if (availableTabs.some((tab) => tab.value === activeTab)) {
      return activeTab;
    }
    return availableTabs[0]?.value ?? 'admin';
  }, [availableTabs, activeTab]);

  if (authLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading permissions">
        <Skeleton className="h-14 w-80" />
        <SkeletonGrid count={4} />
      </div>
    );
  }

  if (availableTabs.length === 0) {
    return (
      <EmptyState
        icon="alert"
        title="Dashboard Access Restricted"
        hint="You do not have permission to view any operations dashboard. Contact your administrator to request access."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OPERATIONS OVERVIEW"
        title="Operations Dashboard"
        description="Live operational pulse across kitchen, delivery, and administration."
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon="refresh"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Refresh
          </Button>
        }
      />

      {/* Role view switcher (shown when user has multiple dashboard permissions) */}
      {availableTabs.length > 1 && (
        <Tabs<DashboardView>
          tabs={availableTabs.map((t) => ({ value: t.value, label: `${t.label} View` }))}
          value={currentView}
          onChange={setActiveTab}
          label="Operations dashboard role selector"
        />
      )}

      {/* Render selected view */}
      {currentView === 'admin' && <AdminDashboardView refreshKey={refreshKey} />}
      {currentView === 'kitchen' && <KitchenDashboardView refreshKey={refreshKey} />}
      {currentView === 'dispatch' && <DispatchDashboardView refreshKey={refreshKey} />}
      {currentView === 'driver' && <DriverDashboardView refreshKey={refreshKey} />}
    </div>
  );
}
