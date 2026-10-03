import { apiCall } from './api-client';

export function fetchDashboard<T>(role: 'admin' | 'kitchen' | 'dispatch' | 'driver') {
  return apiCall<T>(`/dashboard/${role}`);
}
