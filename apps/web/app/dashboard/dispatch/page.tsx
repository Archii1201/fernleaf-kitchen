'use client';

import { useEffect, useState } from 'react';
import { fetchDashboard } from '../../../lib/dashboard-api';
import { DashboardShell, Kpi } from '../dashboard-shell';
import { useProfile } from '../use-profile';

type DispatchDash = {
  metrics: {
    dropsToday: number;
    needsDriver: number;
    leavingSoon: number;
    late: number;
    onTimeRatePercent: number | null;
  };
  groups: { driverLoad: { driver: string; count: number }[] };
  lists: {
    needsDriver: { id: string; company: string; time: string }[];
    leavingSoon: { id: string; company: string }[];
    late: { id: string; company: string }[];
  };
};

export default function DispatchDashboardPage() {
  const { permissions, error } = useProfile();
  const [data, setData] = useState<DispatchDash | null>(null);

  useEffect(() => {
    if (permissions.includes('dispatch.view')) {
      fetchDashboard<DispatchDash>('dispatch').then(setData).catch(() => undefined);
    }
  }, [permissions]);

  if (error) {
    return <p>{error}</p>;
  }

  return (
    <DashboardShell permissions={permissions}>
      <h1 className="text-2xl font-semibold">Dispatch dashboard</h1>
      {data ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Drops" value={data.metrics.dropsToday} />
            <Kpi label="Need driver" value={data.metrics.needsDriver} />
            <Kpi label="Late" value={data.metrics.late} />
            <Kpi
              label="On-time %"
              value={data.metrics.onTimeRatePercent === null ? 'n/a' : `${data.metrics.onTimeRatePercent}%`}
            />
          </section>
          <h2 className="font-medium">Needs driver</h2>
          <ul>
            {data.lists.needsDriver.map((drop) => (
              <li key={drop.id}>
                {drop.time} {drop.company}
              </li>
            ))}
          </ul>
          <h2 className="font-medium">Driver load</h2>
          <ul>
            {data.groups.driverLoad.map((row) => (
              <li key={row.driver}>
                {row.driver}: {row.count}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </DashboardShell>
  );
}
