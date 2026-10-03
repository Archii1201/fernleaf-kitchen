'use client';

import { useEffect, useState } from 'react';
import { fetchDashboard } from '../../../lib/dashboard-api';
import { DashboardShell, Kpi } from '../dashboard-shell';
import { useProfile } from '../use-profile';

type DriverDash = {
  metrics: {
    assigned: number;
    delivered: number;
    remaining: number;
    percentDelivered: number;
    onTimeCount: number;
  };
  lists: {
    nextDrop: { time: string; company: string; address: { line1: string; city: string } } | null;
  };
};

export default function DriverDashboardPage() {
  const { permissions, error } = useProfile();
  const [data, setData] = useState<DriverDash | null>(null);

  useEffect(() => {
    if (permissions.includes('driver.view')) {
      fetchDashboard<DriverDash>('driver').then(setData).catch(() => undefined);
    }
  }, [permissions]);

  if (error) {
    return <p>{error}</p>;
  }

  return (
    <DashboardShell permissions={permissions}>
      <h1 className="text-2xl font-semibold">Driver dashboard</h1>
      {data ? (
        <>
          <section className="rounded border p-4">
            <p className="text-sm uppercase opacity-70">Next drop</p>
            {data.lists.nextDrop ? (
              <p className="text-xl font-semibold">
                {data.lists.nextDrop.time} · {data.lists.nextDrop.company}
                <br />
                <span className="text-base font-normal">
                  {data.lists.nextDrop.address.line1}, {data.lists.nextDrop.address.city}
                </span>
              </p>
            ) : (
              <p>No remaining drops today.</p>
            )}
          </section>
          <section className="grid grid-cols-2 gap-3">
            <Kpi label="Assigned" value={data.metrics.assigned} />
            <Kpi label="Delivered" value={data.metrics.delivered} />
            <Kpi label="Remaining" value={data.metrics.remaining} />
            <Kpi label="On-time" value={data.metrics.onTimeCount} />
          </section>
          <p>Progress {data.metrics.percentDelivered}%</p>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </DashboardShell>
  );
}
