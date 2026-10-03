'use client';

import { useEffect, useState } from 'react';
import { fetchDashboard } from '../../../lib/dashboard-api';
import { DashboardShell, Kpi } from '../dashboard-shell';
import { useProfile } from '../use-profile';

type KitchenDash = {
  metrics: {
    unitsToday: number;
    late: number;
    atRisk: number;
    nextDeadline: { at: string; orderNumber: string; station: string } | null;
  };
  groups: {
    unitsByStation: { station: string; count: number }[];
    tomorrow: { date: string; units: number; byStation: { station: string; count: number }[] };
  };
  lists: { prep: { id: string; dish: string; station: string; status: string; timing: string }[] };
};

export default function KitchenDashboardPage() {
  const { permissions, error } = useProfile();
  const [data, setData] = useState<KitchenDash | null>(null);

  useEffect(() => {
    if (permissions.includes('kitchen.view')) {
      fetchDashboard<KitchenDash>('kitchen').then(setData).catch(() => undefined);
    }
  }, [permissions]);

  if (error) {
    return <p>{error}</p>;
  }

  return (
    <DashboardShell permissions={permissions}>
      <h1 className="text-2xl font-semibold">Kitchen dashboard</h1>
      {data ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Units today" value={data.metrics.unitsToday} />
            <Kpi label="Late" value={data.metrics.late} />
            <Kpi label="At risk" value={data.metrics.atRisk} />
            <Kpi label="Next deadline" value={data.metrics.nextDeadline?.orderNumber ?? '—'} />
          </section>
          <h2 className="font-medium">Stations</h2>
          <ul>
            {data.groups.unitsByStation.map((row) => (
              <li key={row.station}>
                {row.station}: {row.count}
              </li>
            ))}
          </ul>
          <h2 className="font-medium">Prep list</h2>
          <ul>
            {data.lists.prep.map((unit) => (
              <li key={unit.id}>
                {unit.station} · {unit.dish} · {unit.status} · {unit.timing}
              </li>
            ))}
          </ul>
          <p>
            Tomorrow ({data.groups.tomorrow.date}): {data.groups.tomorrow.units} units
          </p>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </DashboardShell>
  );
}
