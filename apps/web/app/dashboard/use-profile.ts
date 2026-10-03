'use client';

import { useEffect, useState } from 'react';
import { apiCall } from '../../lib/api-client';

export function useProfile() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiCall<{ permissions: string[] }>('/auth/me')
      .then((profile) => setPermissions(profile.permissions))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Not signed in');
      });
  }, []);

  return { permissions, error };
}
