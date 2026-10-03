'use client';

import { useEffect, useState } from 'react';
import { fetchDashboard } from '../../../lib/dashboard-api';
import { DashboardShell, Kpi } from '../dashboard-shell';
import { useProfile } from '../use-profile';

type AdminDash = {
  date: string;
  metrics: {
    ordersToday: number;
    mealsToday: number;
    kitchenProgress: { totalUnits: number; completedUnits: number; percentComplete: number };
    nextCutoff: { deliveryDate: string; cutoffAt: string } | null;
    pendingCutoff: { date: string }[];
    uninvoicedBalanceCents: number;
    outstandingInvoices: { count: number; totalCents: number };
  };
  groups: { next7Days: { date: string; orders: number; meals: number }[] };
  lists: { setupGaps: { code: string; message: string }[] };
};

export default function AdminDashboardPage() {
  const { permissions, error } = useProfile();
  const [data, setData] = useState<AdminDash | null>(null);

  useEffect(() => {
    if (permissions.includes('reports.view')) {
      fetchDashboard<AdminDash>('admin').then(setData).catch(() => undefined);
    }
  }, [permissions]);

  if (error) {
    return <p>{error}</p>;
  }

  return (
    <DashboardShell permissions={permissions}>
      <h1 className="text-2xl font-semibold">Admin dashboard</h1>
      {data ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Orders today" value={data.metrics.ordersToday} />
            <Kpi label="Meals today" value={data.metrics.mealsToday} />
            <Kpi label="Kitchen %" value={`${data.metrics.kitchenProgress.percentComplete}%`} />
            <Kpi label="Uninvoiced ₹" value={(data.metrics.uninvoicedBalanceCents / 100).toFixed(2)} />
          </section>
          <p>Next cutoff: {data.metrics.nextCutoff?.cutoffAt ?? 'none'}</p>
          <p>Pending processing: {data.metrics.pendingCutoff.length}</p>
          <p>
            Outstanding invoices: {data.metrics.outstandingInvoices.count} /{' '}
            {data.metrics.outstandingInvoices.totalCents} cents
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th>Orders</th>
                <th>Meals</th>
              </tr>
            </thead>
            <tbody>
              {data.groups.next7Days.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{row.orders}</td>
                  <td>{row.meals}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul>
            {data.lists.setupGaps.map((gap) => (
              <li key={gap.code}>{gap.message}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </DashboardShell>
  );
}
