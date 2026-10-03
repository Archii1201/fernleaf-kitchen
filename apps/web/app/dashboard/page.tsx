'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from './use-profile';

export default function DashboardIndexPage() {
  const { permissions, error } = useProfile();
  const router = useRouter();

  useEffect(() => {
    if (permissions.includes('reports.view')) {
      router.replace('/dashboard/admin');
    } else if (permissions.includes('kitchen.view')) {
      router.replace('/dashboard/kitchen');
    } else if (permissions.includes('dispatch.view')) {
      router.replace('/dashboard/dispatch');
    } else if (permissions.includes('driver.view')) {
      router.replace('/dashboard/driver');
    }
  }, [permissions, router]);

  return <p>{error ?? 'Opening your dashboard…'}</p>;
}
