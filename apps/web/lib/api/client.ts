/**
 * Requests go through the Next.js `/api` rewrite by default, so the httpOnly
 * session cookie set by NestJS stays first-party and is never readable here.
 */
export const API_URL = '/api';
export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export type Query = Record<string, string | number | boolean | undefined | null>;

/** Mirrors the API error envelope: `{ statusCode, code, message, requestId }`. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, credentials: 'include', headers });
  } catch {
    throw new ApiError('Cannot reach the Fernleaf API. Check that it is running.', 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      code?: string;
      statusCode?: number;
      requestId?: string;
    } | null;
    const message = Array.isArray(body?.message) ? body.message.join('; ') : body?.message;

    throw new ApiError(
      message ?? `Request failed (${response.status})`,
      body?.statusCode ?? response.status,
      body?.code,
      body?.requestId ?? response.headers.get('x-request-id') ?? undefined,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const get = <T>(path: string, query?: Query) => apiCall<T>(`${path}${qs(query)}`);

export const send = <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
  apiCall<T>(path, {
    method,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });

export function qs(params?: Query): string {
  if (!params) {
    return '';
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.requestId ? `${error.message} (ref ${error.requestId})` : error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong';
}

export const fileUrl = (fileId: string) => `${API_URL}/files/${fileId}`;
